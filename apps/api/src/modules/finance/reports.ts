import type { CompareDTO, ReportsDTO } from '@financas/shared';
import { addMonths, localDate } from '@financas/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { balanceHistory, compareMonths, monthEnd, monthlyCashflow, monthsBack, toCsv } from '../../domain/reports';
import { prisma } from '../../lib/db';
import { requireAuth } from '../../plugins/session';
import { balanceCents, flowTxs } from './queries';

const YM = /^\d{4}-\d{2}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function reportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/reports', async (request, reply): Promise<ReportsDTO | undefined> => {
    const q = z.object({ months: z.coerce.number().int().min(3).max(24).default(12) }).safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: 'Parâmetros inválidos' });
    const today = localDate(new Date());
    const months = monthsBack(today.slice(0, 7), q.data.months);
    const from = `${months[0]}-01`;

    const [txs, liquid, accountTxs, investments] = await Promise.all([
      flowTxs(from, monthEnd(months.at(-1)!)),
      balanceCents(),
      // Só o que compõe o saldo em conta (conta corrente e dinheiro), sem parcelas futuras
      prisma.transaction.findMany({
        where: { deletedAt: null, localDate: { gte: from, lte: today }, account: { type: { in: ['BANK', 'CASH'] } } },
        select: { amountCents: true, localDate: true },
      }),
      prisma.investment.aggregate({ _sum: { balanceCents: true } }),
    ]);

    return {
      cashflow: monthlyCashflow(
        txs.filter((t) => t.localDate <= today),
        months,
      ),
      balance: balanceHistory(
        liquid,
        accountTxs.map((t) => ({ amountCents: Number(t.amountCents), localDate: t.localDate })),
        months,
        today,
      ),
      liquidCents: liquid,
      investmentsCents: Number(investments._sum.balanceCents ?? 0n),
    };
  });

  app.get('/reports/compare', async (request, reply): Promise<CompareDTO | undefined> => {
    const q = z.object({ a: z.string().regex(YM), b: z.string().regex(YM) }).safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: 'Meses inválidos' });
    const [a, b, cats] = await Promise.all([
      flowTxs(`${q.data.a}-01`, monthEnd(q.data.a)),
      flowTxs(`${q.data.b}-01`, monthEnd(q.data.b)),
      prisma.category.findMany(),
    ]);
    const rows = compareMonths(a, b, new Map(cats.map((c) => [c.id, c])));
    return { a: q.data.a, b: q.data.b, rows, aTotalCents: rows.reduce((s, r) => s + r.aCents, 0), bTotalCents: rows.reduce((s, r) => s + r.bCents, 0) };
  });

  // Planilha das transações (Excel/Google Planilhas em português)
  app.get('/reports/export.csv', async (request, reply) => {
    const today = localDate(new Date());
    const q = z
      .object({ from: z.string().regex(YMD).default(`${addMonths(today.slice(0, 7), -11)}-01`), to: z.string().regex(YMD).default(today) })
      .safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: 'Período inválido' });
    const rows = await prisma.transaction.findMany({
      where: { deletedAt: null, localDate: { gte: q.data.from, lte: q.data.to } },
      include: { category: true, account: { select: { name: true } } },
      orderBy: [{ localDate: 'desc' }, { date: 'desc' }],
    });
    const csv = toCsv(
      rows.map((r) => ({
        localDate: r.localDate,
        description: r.description,
        category: r.category?.name ?? '',
        account: r.account.name,
        amountCents: Number(r.amountCents),
        notes: r.notes ?? '',
        tags: r.tags,
      })),
    );
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="kaixa-${q.data.from}-a-${q.data.to}.csv"`)
      .header('Cache-Control', 'no-store')
      .send(csv);
  });
}
