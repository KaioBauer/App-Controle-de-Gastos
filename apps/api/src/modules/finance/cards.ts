import type { CardDTO, CardsDTO } from '@financas/shared';
import { addDays, localDate } from '@financas/shared';
import type { FastifyInstance } from 'fastify';
import {
  billCycle,
  billTotal,
  detectRecurring,
  futureBills,
  groupInstallments,
  openBillTxs,
  type CardTx,
} from '../../domain/cards';
import { spendingByCategory } from '../../domain/spending';
import { prisma } from '../../lib/db';
import { requireAuth } from '../../plugins/session';
import { toTransactionDTO, txInclude } from './queries';

/** Histórico usado para detectar recorrentes e parcelas em andamento */
const HISTORY_DAYS = 400;

/** Monta a tela de cartões (fatura aberta, fixas, parcelas, histórico) para cada cartão. */
export async function buildCards(today = localDate(new Date())): Promise<CardsDTO> {
  const [accounts, categories] = await Promise.all([
    prisma.account.findMany({
      where: { type: 'CREDIT' },
      include: { bills: { orderBy: { dueDate: 'desc' }, take: 12 } },
      orderBy: { name: 'asc' },
    }),
    prisma.category.findMany(),
  ]);
  const catById = new Map(categories.map((c) => [c.id, c]));

  const cards = await Promise.all(
    accounts.map(async (acc): Promise<CardDTO> => {
      const rows = await prisma.transaction.findMany({
        where: { accountId: acc.id, deletedAt: null, localDate: { gte: addDays(today, -HISTORY_DAYS) } },
        include: txInclude,
        orderBy: [{ localDate: 'desc' }, { date: 'desc' }],
      });
      const txs: (CardTx & { row: (typeof rows)[number] })[] = rows.map((r) => ({
        row: r,
        id: r.id,
        amountCents: Number(r.amountCents),
        localDate: r.localDate,
        categoryId: r.categoryId,
        categoryKind: r.category?.kind ?? null,
        isTransfer: r.isTransfer,
        description: r.description,
        status: r.status,
        billId: r.billId,
        installmentNumber: r.installmentNumber,
        totalInstallments: r.totalInstallments,
        purchaseDate: r.purchaseDate,
      }));

      const lastBill = acc.bills[0];
      const lastBillTxDate = lastBill
        ? (await prisma.transaction.aggregate({ where: { billId: lastBill.id }, _max: { localDate: true } }))._max.localDate
        : null;
      const cycle = billCycle(
        lastBill ? { dueDate: lastBill.dueDate.toISOString().slice(0, 10), lastTxDate: lastBillTxDate } : null,
        today,
      );

      // Pagamentos da fatura são transferências: não aparecem como compra
      const open = openBillTxs(txs, cycle).filter((t) => !t.isTransfer) as typeof txs;
      const recurring = detectRecurring(txs, today);
      const installments = groupInstallments(txs, cycle);
      const cat = (id: string | null) => (id ? catById.get(id) : undefined);

      return {
        accountId: acc.id,
        name: acc.name,
        limitCents: acc.creditLimitCents != null ? Number(acc.creditLimitCents) : null,
        availableCents: acc.availableCreditCents != null ? Number(acc.availableCreditCents) : null,
        usedCents: Number(acc.balanceCents),
        openBill: {
          totalCents: billTotal(open),
          closeDate: cycle.nextClose,
          dueDate: cycle.nextDue,
          transactions: open.map((t) => toTransactionDTO(t.row)),
          categories: [...spendingByCategory(open).entries()]
            .filter(([, cents]) => cents > 0)
            .map(([id, cents]) => ({ name: cat(id)?.name ?? 'Sem categoria', icon: cat(id)?.icon ?? 'other', cents }))
            .sort((a, b) => b.cents - a.cents),
        },
        futureBills: futureBills(txs, cycle),
        recurring: recurring.map((r) => ({
          name: r.name,
          icon: cat(r.categoryId)?.icon ?? 'other',
          categoryName: cat(r.categoryId)?.name ?? 'Sem categoria',
          amountCents: r.amountCents,
          nextDate: r.nextDate,
        })),
        recurringTotalCents: recurring.reduce((s, r) => s + r.amountCents, 0),
        installments: installments.map((i) => ({
          name: i.name,
          icon: cat(i.categoryId)?.icon ?? 'other',
          installmentCents: i.installmentCents,
          current: i.current,
          total: i.total,
          remainingCents: i.remainingCents,
          lastDate: i.lastDate,
        })),
        installmentsRemainingCents: installments.reduce((s, i) => s + i.remainingCents, 0),
        bills: acc.bills.map((b) => ({ id: b.id, dueDate: b.dueDate.toISOString().slice(0, 10), totalCents: Number(b.totalAmountCents) })),
      };
    }),
  );
  return { cards };
}

export async function cardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/cards', () => buildCards());

  // Compras de uma fatura fechada
  app.get('/cards/bills/:billId', async (request) => {
    const { billId } = request.params as { billId: string };
    const rows = await prisma.transaction.findMany({
      where: { billId, deletedAt: null, isTransfer: false },
      include: txInclude,
      orderBy: [{ localDate: 'desc' }, { date: 'desc' }],
    });
    return { items: rows.map(toTransactionDTO) };
  });
}
