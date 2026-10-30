import type { AccountDTO, RuleDTO, TransactionListDTO } from '@financas/shared';
import { localDate } from '@financas/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { merchantKey } from '../../domain/merchant';
import { prisma } from '../../lib/db';
import { requireAuth } from '../../plugins/session';
import { buildTxWhere, txFilterQuery } from './filters';
import { toCategoryDTO, toTransactionDTO, txInclude } from './queries';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CENTS = 99_999_999_99;

const listQuery = txFilterQuery.extend({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const newTxBody = z.object({
  amountCents: z.number().int().positive().max(MAX_CENTS),
  kind: z.enum(['expense', 'income']).default('expense'),
  categoryId: z.string().uuid(),
  description: z.string().trim().max(200).optional(),
  localDate: z.string().regex(YMD).optional(),
});

const patchBody = z.object({
  notes: z.string().trim().max(1000).nullable().optional(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).optional(),
  reviewed: z.boolean().optional(),
  // Só para lançamentos manuais
  amountCents: z.number().int().positive().max(MAX_CENTS).optional(),
  kind: z.enum(['expense', 'income']).optional(),
  description: z.string().trim().min(1).max(200).optional(),
  localDate: z.string().regex(YMD).optional(),
});

const recategorizeBody = z.object({
  categoryId: z.string().uuid(),
  /** Aplica às outras transações do mesmo estabelecimento que o usuário não categorizou à mão */
  applyToSimilar: z.boolean().default(false),
  /** Cria/atualiza a regra para as próximas transações sincronizadas */
  createRule: z.boolean().default(false),
});

const reviewBody = z.union([
  z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }),
  z.object({ all: z.literal(true) }),
]);

const sumCents = (v: bigint | null | undefined) => Number(v ?? 0n);

/** Transações do mesmo estabelecimento, exceto a própria e as que o usuário escolheu individualmente. */
function similarWhere(id: string, key: string) {
  return { merchantKey: key, id: { not: id }, deletedAt: null, categoryManual: false };
}

export async function transactionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/accounts', async (): Promise<AccountDTO[]> => {
    const accounts = await prisma.account.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] });
    return accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }));
  });

  app.get('/transactions', async (request, reply): Promise<TransactionListDTO | undefined> => {
    const q = listQuery.safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: 'Filtros inválidos' });
    const where = buildTxWhere(q.data, localDate(new Date()));

    const rows = await prisma.transaction.findMany({
      where,
      include: txInclude,
      orderBy: [{ localDate: 'desc' }, { date: 'desc' }, { id: 'desc' }],
      take: q.data.limit + 1,
      ...(q.data.cursor ? { cursor: { id: q.data.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.data.limit;
    const items = rows.slice(0, q.data.limit);
    const result: TransactionListDTO = { items: items.map(toTransactionDTO), nextCursor: hasMore ? items.at(-1)!.id : null };

    // Totais só na primeira página, com a mesma regra de domain/spending.ts: transferências
    // não contam; estorno numa categoria de gasto abate o gasto (não vira entrada).
    if (!q.data.cursor) {
      const expenseWhere = {
        isTransfer: false,
        OR: [{ category: { kind: 'EXPENSE' as const } }, { categoryId: null, amountCents: { lt: 0 } }],
      };
      const incomeWhere = {
        isTransfer: false,
        OR: [{ category: { kind: 'INCOME' as const } }, { categoryId: null, amountCents: { gt: 0 } }],
      };
      const [count, out, inc] = await Promise.all([
        prisma.transaction.count({ where }),
        prisma.transaction.aggregate({ where: { AND: [where, expenseWhere] }, _sum: { amountCents: true } }),
        prisma.transaction.aggregate({ where: { AND: [where, incomeWhere] }, _sum: { amountCents: true } }),
      ]);
      result.totals = { count, expenseCents: -sumCents(out._sum.amountCents), incomeCents: sumCents(inc._sum.amountCents) };
    }
    return result;
  });

  // Lançamento manual (dinheiro em espécie): gasto ou entrada
  app.post('/transactions', async (request, reply) => {
    const body = newTxBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Dados inválidos' });
    const { amountCents, kind, categoryId, description, localDate: day } = body.data;

    const [category, cash] = await Promise.all([
      prisma.category.findUnique({ where: { id: categoryId } }),
      prisma.account.findFirst({ where: { type: 'CASH' } }),
    ]);
    if (!category) return reply.code(400).send({ error: 'Categoria não encontrada' });
    if (!cash) return reply.code(500).send({ error: 'Conta de dinheiro não configurada' });

    const now = new Date();
    const today = localDate(now);
    const text = description || category.name;
    const tx = await prisma.transaction.create({
      data: {
        accountId: cash.id,
        amountCents: BigInt(kind === 'expense' ? -amountCents : amountCents),
        // Datas passadas ficam ao meio-dia de Brasília
        date: !day || day === today ? now : new Date(`${day}T12:00:00-03:00`),
        localDate: day ?? today,
        description: text,
        merchantKey: merchantKey(text),
        categoryId,
        categoryLocked: true,
        categoryManual: true,
        isTransfer: category.kind === 'TRANSFER',
        reviewed: true,
      },
      include: txInclude,
    });
    return reply.code(201).send(toTransactionDTO(tx));
  });

  app.patch('/transactions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = patchBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Dados inválidos' });
    const current = await prisma.transaction.findFirst({ where: { id, deletedAt: null } });
    if (!current) return reply.code(404).send({ error: 'Transação não encontrada' });

    const { notes, tags, reviewed, amountCents, kind, description, localDate: day } = body.data;
    const editsBankData = amountCents !== undefined || kind !== undefined || description !== undefined || day !== undefined;
    // Valor, descrição e data de transações do banco voltariam no próximo sync
    if (editsBankData && current.pluggyId) {
      return reply.code(400).send({ error: 'Só lançamentos manuais podem ter valor, descrição e data alterados' });
    }

    const sign = kind ? (kind === 'expense' ? -1 : 1) : current.amountCents < 0n ? -1 : 1;
    const tx = await prisma.transaction.update({
      where: { id },
      data: {
        ...(notes !== undefined ? { notes: notes || null } : {}),
        ...(tags !== undefined ? { tags: [...new Set(tags)] } : {}),
        ...(reviewed !== undefined ? { reviewed } : {}),
        ...(amountCents !== undefined || kind !== undefined
          ? { amountCents: BigInt(sign * (amountCents ?? Math.abs(Number(current.amountCents)))) }
          : {}),
        ...(description !== undefined ? { description, merchantKey: merchantKey(description) } : {}),
        ...(day !== undefined ? { localDate: day, date: new Date(`${day}T12:00:00-03:00`) } : {}),
      },
      include: txInclude,
    });
    return toTransactionDTO(tx);
  });

  // Quantas "parecidas" seriam afetadas (para o texto do switch na tela)
  app.get('/transactions/:id/similar', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tx = await prisma.transaction.findFirst({ where: { id, deletedAt: null }, select: { merchantKey: true } });
    if (!tx) return reply.code(404).send({ error: 'Transação não encontrada' });
    if (!tx.merchantKey) return { count: 0, rule: null };
    const [count, rule] = await Promise.all([
      prisma.transaction.count({ where: similarWhere(id, tx.merchantKey) }),
      prisma.categoryRule.findUnique({ where: { pattern: tx.merchantKey }, include: { category: true } }),
    ]);
    return { count, rule: rule ? { id: rule.id, category: toCategoryDTO(rule.category) } : null };
  });

  app.post('/transactions/:id/recategorize', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = recategorizeBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Dados inválidos' });
    const { categoryId, applyToSimilar, createRule } = body.data;

    const [tx, category] = await Promise.all([
      prisma.transaction.findFirst({ where: { id, deletedAt: null } }),
      prisma.category.findUnique({ where: { id: categoryId } }),
    ]);
    if (!tx) return reply.code(404).send({ error: 'Transação não encontrada' });
    if (!category) return reply.code(400).send({ error: 'Categoria não encontrada' });

    const isTransfer = category.kind === 'TRANSFER';
    const key = tx.merchantKey || merchantKey(tx.description);
    let similar = 0;

    await prisma.$transaction(async (db) => {
      // A escolha manual vale para esta transação mesmo que o sync traga outra categoria
      await db.transaction.update({
        where: { id },
        data: { categoryId, isTransfer, categoryLocked: true, categoryManual: true, reviewed: true },
      });
      if (applyToSimilar && key) {
        // Travadas para o sync não desfazer; continuam "parecidas" para uma próxima troca em lote
        const r = await db.transaction.updateMany({
          where: similarWhere(id, key),
          data: { categoryId, isTransfer, categoryLocked: true },
        });
        similar = r.count;
      }
      if (createRule && key) {
        // "Compra no débito|COOPERALFA ITAIOPOLIS" -> "COOPERALFA ITAIOPOLIS"
        const label = tx.description.split('|').pop()!.trim() || tx.description;
        await db.categoryRule.upsert({
          where: { pattern: key },
          create: { pattern: key, label, categoryId },
          update: { categoryId, label },
        });
      }
    });

    const updated = await prisma.transaction.findUniqueOrThrow({ where: { id }, include: txInclude });
    return { transaction: toTransactionDTO(updated), similarUpdated: similar, ruleCreated: createRule && !!key };
  });

  // Marcar como revisadas (zera o badge do ícone)
  app.post('/transactions/review', async (request, reply) => {
    const body = reviewBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Dados inválidos' });
    const r = await prisma.transaction.updateMany({
      where: { reviewed: false, deletedAt: null, ...('ids' in body.data ? { id: { in: body.data.ids } } : {}) },
      data: { reviewed: true },
    });
    return { updated: r.count };
  });

  app.delete('/transactions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    // Só lançamentos manuais podem ser apagados; os da Pluggy voltariam no próximo sync
    const res = await prisma.transaction.updateMany({
      where: { id, pluggyId: null, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) return reply.code(404).send({ error: 'Lançamento não encontrado' });
    return { ok: true };
  });

  // ---------- Regras de categoria ----------
  app.get('/rules', async (): Promise<RuleDTO[]> => {
    const rules = await prisma.categoryRule.findMany({ include: { category: true }, orderBy: { createdAt: 'desc' } });
    const counts = await prisma.transaction.groupBy({
      by: ['merchantKey'],
      where: { merchantKey: { in: rules.map((r) => r.pattern) }, deletedAt: null },
      _count: true,
    });
    const byKey = new Map(counts.map((c) => [c.merchantKey, c._count]));
    return rules.map((r) => ({ id: r.id, label: r.label, category: toCategoryDTO(r.category), matches: byKey.get(r.pattern) ?? 0 }));
  });

  app.delete('/rules/:id', async (request) => {
    const { id } = request.params as { id: string };
    await prisma.categoryRule.deleteMany({ where: { id } });
    return { ok: true };
  });
}
