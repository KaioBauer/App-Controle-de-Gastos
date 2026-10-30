import type { GoalDTO } from '@financas/shared';
import { localDate } from '@financas/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { goalProgress } from '../../domain/goals';
import { prisma } from '../../lib/db';
import { requireAuth } from '../../plugins/session';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CENTS = 99_999_999_99;

const goalBody = z.object({
  name: z.string().trim().min(1).max(60),
  targetCents: z.number().int().positive().max(MAX_CENTS),
  deadline: z.string().regex(YMD).nullable(),
  icon: z.string().max(20).default('target'),
});

const contributionBody = z.object({
  amountCents: z.number().int().positive().max(MAX_CENTS),
  kind: z.enum(['deposit', 'withdraw']).default('deposit'),
});

export async function goalRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/goals', async (): Promise<GoalDTO[]> => {
    const today = localDate(new Date());
    const goals = await prisma.goal.findMany({
      include: { contributions: { orderBy: [{ localDate: 'desc' }, { createdAt: 'desc' }] } },
      orderBy: { createdAt: 'asc' },
    });
    return goals.map((g) => {
      const contributions = g.contributions.map((c) => ({ id: c.id, amountCents: Number(c.amountCents), localDate: c.localDate }));
      return {
        id: g.id,
        name: g.name,
        icon: g.icon,
        targetCents: Number(g.targetCents),
        deadline: g.deadline,
        contributions,
        ...goalProgress({ targetCents: Number(g.targetCents), deadline: g.deadline, createdOn: localDate(g.createdAt) }, contributions, today),
      };
    });
  });

  app.post('/goals', async (request, reply) => {
    const b = goalBody.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'Dados inválidos' });
    const g = await prisma.goal.create({ data: { ...b.data, targetCents: BigInt(b.data.targetCents) } });
    return reply.code(201).send({ id: g.id });
  });

  app.patch('/goals/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = goalBody.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'Dados inválidos' });
    await prisma.goal.update({ where: { id }, data: { ...b.data, targetCents: BigInt(b.data.targetCents) } });
    return { ok: true };
  });

  app.delete('/goals/:id', async (request) => {
    const { id } = request.params as { id: string };
    await prisma.goal.deleteMany({ where: { id } });
    return { ok: true };
  });

  app.post('/goals/:id/contributions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = contributionBody.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'Valor inválido' });
    const goal = await prisma.goal.findUnique({ where: { id }, include: { contributions: true } });
    if (!goal) return reply.code(404).send({ error: 'Meta não encontrada' });
    const saved = goal.contributions.reduce((s, c) => s + Number(c.amountCents), 0);
    if (b.data.kind === 'withdraw' && b.data.amountCents > saved) {
      return reply.code(400).send({ error: 'A retirada é maior que o valor guardado' });
    }
    await prisma.goalContribution.create({
      data: {
        goalId: id,
        amountCents: BigInt(b.data.kind === 'withdraw' ? -b.data.amountCents : b.data.amountCents),
        localDate: localDate(new Date()),
      },
    });
    return reply.code(201).send({ ok: true });
  });

  app.delete('/goals/:id/contributions/:cid', async (request) => {
    const { id, cid } = request.params as { id: string; cid: string };
    await prisma.goalContribution.deleteMany({ where: { id: cid, goalId: id } });
    return { ok: true };
  });
}
