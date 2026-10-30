import type { BillsDTO, UpcomingDTO } from '@financas/shared';
import { addDays, localDate } from '@financas/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentOccurrence, findPayment, suggestBills, type BillDef } from '../../domain/bills';
import type { CardTx } from '../../domain/cards';
import { merchantKey } from '../../domain/merchant';
import { prisma } from '../../lib/db';
import { requireAuth } from '../../plugins/session';
import { buildCards } from './cards';
import { toCategoryDTO } from './queries';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;
/** Histórico usado para sugerir contas recorrentes */
const SUGGESTION_DAYS = 200;

const billBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    amountCents: z.number().int().positive().max(99_999_999_99).nullable(),
    dueDay: z.number().int().min(1).max(31).nullable(),
    dueDate: z.string().regex(YMD).nullable(),
    categoryId: z.string().uuid().nullable(),
    /** Descrição de exemplo do extrato (para dar baixa automática) */
    matchDescription: z.string().max(200).nullable().optional(),
    matchKey: z.string().max(120).nullable().optional(),
  })
  .refine((b) => !!b.dueDay !== !!b.dueDate, 'Informe o dia do mês (mensal) ou a data (única)');

type BillRow = Awaited<ReturnType<typeof loadRows>>[number];

function loadRows() {
  return prisma.bill.findMany({ where: { active: true }, include: { payments: true, category: true }, orderBy: { name: 'asc' } });
}

function toDef(b: BillRow): BillDef {
  return {
    id: b.id,
    name: b.name,
    amountCents: b.amountCents != null ? Number(b.amountCents) : null,
    dueDay: b.dueDay,
    dueDate: b.dueDate,
    matchKey: b.matchKey,
    createdOn: localDate(b.createdAt),
  };
}

/**
 * Dá baixa sozinha nas ocorrências em aberto quando o pagamento aparece no extrato.
 * Roda ao listar as contas e ao fim de cada sync.
 */
export async function autoPayBills(today = localDate(new Date())) {
  const bills = await loadRows();
  let paid = 0;
  for (const b of bills) {
    if (!b.matchKey) continue;
    const def = toDef(b);
    const done = new Set(b.payments.map((p) => p.period));
    // Até duas ocorrências por vez (mês anterior vencido + atual)
    for (let i = 0; i < 2; i++) {
      const occ = currentOccurrence(def, today, done);
      if (!occ || occ.status === 'paid') break;
      const txs = await prisma.transaction.findMany({
        where: { merchantKey: b.matchKey, deletedAt: null, localDate: { gte: addDays(occ.dueDate, -15), lte: addDays(occ.dueDate, 15) } },
        select: { id: true, description: true, amountCents: true, localDate: true },
      });
      const used = new Set(b.payments.map((p) => p.transactionId));
      const txId = findPayment(
        def,
        occ.dueDate,
        txs.filter((t) => !used.has(t.id)).map((t) => ({ ...t, amountCents: Number(t.amountCents) })),
      );
      if (!txId) break;
      await prisma.billPayment.upsert({
        where: { billId_period: { billId: b.id, period: occ.period } },
        create: { billId: b.id, period: occ.period, transactionId: txId },
        update: {},
      });
      done.add(occ.period);
      paid++;
    }
  }
  return paid;
}

export async function loadBills(today = localDate(new Date())): Promise<BillsDTO> {
  await autoPayBills(today);
  const [rows, cards, dismissed, history] = await Promise.all([
    loadRows(),
    buildCards(today),
    prisma.dismissedSuggestion.findMany(),
    prisma.transaction.findMany({
      // Fora do cartão: débito, PIX, boleto (as recorrentes do cartão já aparecem em Cartões)
      where: { deletedAt: null, localDate: { gte: addDays(today, -SUGGESTION_DAYS), lte: today }, account: { type: { in: ['BANK', 'CASH'] } } },
      include: { category: true },
    }),
  ]);

  const bills = rows.map((b) => {
    const occ = currentOccurrence(toDef(b), today, new Set(b.payments.map((p) => p.period)));
    return {
      id: b.id,
      name: b.name,
      amountCents: b.amountCents != null ? Number(b.amountCents) : null,
      dueDay: b.dueDay,
      dueDate: b.dueDate,
      category: b.category ? toCategoryDTO(b.category) : null,
      autoMatch: !!b.matchKey,
      occurrence: occ,
    };
  });

  const known = new Set([...rows.map((b) => b.matchKey).filter((k): k is string => !!k), ...dismissed.map((d) => d.matchKey)]);
  const txs: CardTx[] = history.map((t) => ({
    id: t.id,
    description: t.description,
    amountCents: Number(t.amountCents),
    localDate: t.localDate,
    categoryId: t.categoryId,
    categoryKind: t.category?.kind ?? null,
    isTransfer: t.isTransfer,
    status: t.status,
    billId: null,
    installmentNumber: t.installmentNumber,
    totalInstallments: t.totalInstallments,
  }));
  const catById = new Map(history.filter((t) => t.category).map((t) => [t.categoryId!, t.category!]));
  const suggestions = suggestBills(txs, today, known).map((s) => ({
    matchKey: s.matchKey,
    name: s.name,
    amountCents: s.amountCents,
    dueDay: s.dueDay,
    category: s.categoryId && catById.get(s.categoryId) ? toCategoryDTO(catById.get(s.categoryId)!) : null,
  }));

  const upcoming: UpcomingDTO[] = [
    ...bills
      .filter((b) => b.occurrence && b.occurrence.status !== 'paid')
      .map((b) => ({
        key: `bill:${b.id}`,
        kind: 'bill' as const,
        name: b.name,
        amountCents: b.amountCents,
        dueDate: b.occurrence!.dueDate,
        status: b.occurrence!.status,
        icon: b.category?.icon ?? 'home',
        billId: b.id,
        period: b.occurrence!.period,
      })),
    ...cards.cards
      .filter((c) => c.openBill.dueDate && c.openBill.totalCents > 0)
      .map((c) => ({
        key: `card:${c.accountId}`,
        kind: 'card' as const,
        name: `Fatura ${c.name}`,
        amountCents: c.openBill.totalCents,
        dueDate: c.openBill.dueDate!,
        status: (c.openBill.dueDate! < today ? 'overdue' : 'pending') as UpcomingDTO['status'],
        icon: 'card',
      })),
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return { bills, suggestions, upcoming };
}

export async function billRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/bills', () => loadBills());

  app.post('/bills', async (request, reply) => {
    const b = billBody.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: b.error.issues[0]?.message ?? 'Dados inválidos' });
    const { matchDescription, matchKey, amountCents, ...rest } = b.data;
    const key = matchKey ?? (matchDescription ? merchantKey(matchDescription) || null : null);
    const bill = await prisma.bill.create({ data: { ...rest, amountCents: amountCents != null ? BigInt(amountCents) : null, matchKey: key } });
    return reply.code(201).send({ id: bill.id });
  });

  app.patch('/bills/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = billBody.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: b.error.issues[0]?.message ?? 'Dados inválidos' });
    const { matchDescription: _m, matchKey: _k, amountCents, ...rest } = b.data;
    await prisma.bill.update({ where: { id }, data: { ...rest, amountCents: amountCents != null ? BigInt(amountCents) : null } });
    return { ok: true };
  });

  app.delete('/bills/:id', async (request) => {
    const { id } = request.params as { id: string };
    await prisma.bill.deleteMany({ where: { id } });
    return { ok: true };
  });

  // Marcar/desmarcar como paga uma ocorrência (mês)
  app.post('/bills/:id/pay', async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = z.object({ period: z.string().regex(YM) }).safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'Período inválido' });
    await prisma.billPayment.upsert({
      where: { billId_period: { billId: id, period: b.data.period } },
      create: { billId: id, period: b.data.period },
      update: {},
    });
    return { ok: true };
  });

  app.delete('/bills/:id/pay/:period', async (request) => {
    const { id, period } = request.params as { id: string; period: string };
    await prisma.billPayment.deleteMany({ where: { billId: id, period } });
    return { ok: true };
  });

  app.post('/bills/suggestions/:key/dismiss', async (request) => {
    const { key } = request.params as { key: string };
    await prisma.dismissedSuggestion.upsert({ where: { matchKey: key }, create: { matchKey: key }, update: {} });
    return { ok: true };
  });
}
