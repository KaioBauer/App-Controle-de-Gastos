import type { AnalysisDTO, BudgetsDTO, SummaryDTO } from '@financas/shared';
import { daysInMonth, localDate } from '@financas/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildAnalysis, periodRange } from '../../domain/analysis';
import { budgetProgress, incomeOf, spendingByCategory, sumSpending } from '../../domain/spending';
import { prisma } from '../../lib/db';
import { requireAuth } from '../../plugins/session';
import { balanceCents, flowTxs, toCategoryDTO, toTransactionDTO, txInclude } from './queries';

const MAX_CENTS = 99_999_999_99;

/** Orçamentos do mês com progresso e projeção (tela de Orçamentos e notificações). */
export async function loadBudgets(today = localDate(new Date())): Promise<BudgetsDTO> {
  const month = today.slice(0, 7);
  const last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  const [budgets, txs, expenseCats] = await Promise.all([
    prisma.budget.findMany({ include: { category: true } }),
    flowTxs(`${month}-01`, last),
    prisma.category.findMany({ where: { kind: 'EXPENSE' }, orderBy: { sortOrder: 'asc' } }),
  ]);
  const spent = spendingByCategory(txs);
  const items = budgets
    .map((b) => {
      const limitCents = Number(b.limitCents);
      const spentCents = Math.max(0, spent.get(b.categoryId) ?? 0);
      return {
        categoryId: b.categoryId,
        name: b.category.name,
        icon: b.category.icon,
        limitCents,
        spentCents,
        ...budgetProgress(limitCents, spentCents, today),
      };
    })
    .sort((a, b) => b.pct - a.pct);
  const withBudget = new Set(budgets.map((b) => b.categoryId));
  return {
    month,
    totalLimitCents: items.reduce((s, b) => s + b.limitCents, 0),
    totalSpentCents: items.reduce((s, b) => s + b.spentCents, 0),
    budgets: items,
    available: expenseCats.filter((c) => !withBudget.has(c.id)).map(toCategoryDTO),
  };
}

export async function financeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/categories', async () => {
    const cats = await prisma.category.findMany({ orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
    return cats.map(toCategoryDTO);
  });

  app.get('/summary', async (): Promise<SummaryDTO> => {
    const today = localDate(new Date());
    const month = today.slice(0, 7);
    const [balance, txs, budgets, recent] = await Promise.all([
      balanceCents(),
      flowTxs(`${month}-01`, `${month}-31`),
      prisma.budget.findMany({ select: { categoryId: true, limitCents: true } }),
      prisma.transaction.findMany({
        // Parcelas futuras do cartão não são "movimentações recentes"
        where: { deletedAt: null, localDate: { lte: today } },
        include: txInclude,
        orderBy: [{ localDate: 'desc' }, { date: 'desc' }],
        take: 6,
      }),
    ]);
    const budgeted = new Set(budgets.map((b) => b.categoryId));
    return {
      month,
      balanceCents: balance,
      monthSpentCents: sumSpending(txs),
      monthIncomeCents: txs.reduce((s, t) => s + incomeOf(t), 0),
      budgetTotalCents: budgets.reduce((s, b) => s + Number(b.limitCents), 0),
      budgetSpentCents: Math.max(0, sumSpending(txs.filter((t) => t.categoryId && budgeted.has(t.categoryId)))),
      recent: recent.map(toTransactionDTO),
    };
  });

  app.get('/analysis', async (request, reply): Promise<AnalysisDTO | undefined> => {
    const q = z.object({ period: z.enum(['week', 'month', 'year']).default('month') }).safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: 'Período inválido' });
    const today = localDate(new Date());
    const range = periodRange(q.data.period, today);
    const [txs, cats, budgets] = await Promise.all([
      flowTxs(range.prevStart, range.end),
      prisma.category.findMany(),
      prisma.budget.findMany(),
    ]);
    return buildAnalysis(q.data.period, today, txs, new Map(cats.map((c) => [c.id, c])), {
      totalCents: budgets.reduce((s, b) => s + Number(b.limitCents), 0),
      categoryIds: new Set(budgets.map((b) => b.categoryId)),
    });
  });

  app.get('/budgets', () => loadBudgets());

  app.put('/budgets/:categoryId', async (request, reply) => {
    const { categoryId } = request.params as { categoryId: string };
    const body = z.object({ limitCents: z.number().int().positive().max(MAX_CENTS) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Valor inválido' });
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || category.kind !== 'EXPENSE') return reply.code(400).send({ error: 'Categoria inválida' });
    await prisma.budget.upsert({
      where: { categoryId },
      create: { categoryId, limitCents: BigInt(body.data.limitCents) },
      update: { limitCents: BigInt(body.data.limitCents) },
    });
    return { ok: true };
  });

  app.delete('/budgets/:categoryId', async (request) => {
    const { categoryId } = request.params as { categoryId: string };
    await prisma.budget.deleteMany({ where: { categoryId } });
    return { ok: true };
  });
}
