import type { NotificationSettingsDTO } from '@financas/shared';
import type { NotificationSettings } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUserId, prisma } from '../../lib/db';
import { requireAuth } from '../../plugins/session';
import { getSettings } from './service';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const body = z.object({
  newTransaction: z.boolean(),
  newTransactionMinCents: z.number().int().min(0).max(100_000_00),
  budget: z.boolean(),
  billsDue: z.boolean(),
  lowBalance: z.boolean(),
  lowBalanceCents: z.number().int().min(0).max(100_000_00),
  unusualSpending: z.boolean(),
  weeklySummary: z.boolean(),
  monthlySummary: z.boolean(),
  syncErrors: z.boolean(),
  quietStart: z.string().regex(HHMM).nullable(),
  quietEnd: z.string().regex(HHMM).nullable(),
});

function toDTO(s: NotificationSettings): NotificationSettingsDTO {
  return {
    newTransaction: s.newTransaction,
    newTransactionMinCents: Number(s.newTransactionMin),
    budget: s.budget,
    billsDue: s.billsDue,
    lowBalance: s.lowBalance,
    lowBalanceCents: Number(s.lowBalanceCents),
    unusualSpending: s.unusualSpending,
    weeklySummary: s.weeklySummary,
    monthlySummary: s.monthlySummary,
    syncErrors: s.syncErrors,
    quietStart: s.quietStart,
    quietEnd: s.quietEnd,
  };
}

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/settings/notifications', async () => toDTO(await getSettings()));

  app.put('/settings/notifications', async (request, reply) => {
    const b = body.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'Dados inválidos' });
    const { newTransactionMinCents, lowBalanceCents, quietStart, quietEnd, ...flags } = b.data;
    // Horário de silêncio só vale com início e fim
    const quiet = quietStart && quietEnd ? { quietStart, quietEnd } : { quietStart: null, quietEnd: null };
    const data = { ...flags, ...quiet, newTransactionMin: BigInt(newTransactionMinCents), lowBalanceCents: BigInt(lowBalanceCents) };
    const userId = currentUserId();
    const s = await prisma.notificationSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return toDTO(s);
  });
}
