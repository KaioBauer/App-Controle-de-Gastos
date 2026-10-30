import { formatBRL } from '@financas/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../../env';
import { asSystem, currentUserId, prisma } from '../../lib/db';
import { requireAuth } from '../../plugins/session';
import { unreviewedCount } from '../finance/queries';
import { createWebPushSender, sendToAll } from './service';
import { prismaSubscriptionStore } from './store';

const subscribeBody = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function pushRoutes(app: FastifyInstance, { env }: { env: Env }) {
  const sender = createWebPushSender(env);

  // A chave pública VAPID não é segredo
  app.get('/push/vapid-public-key', async () => ({ key: env.VAPID_PUBLIC_KEY }));

  app.register(async (auth) => {
    auth.addHook('preHandler', requireAuth);

    auth.post('/push/subscribe', async (request, reply) => {
      const body = subscribeBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Inscrição inválida' });
      const { endpoint, keys } = body.data;
      const userId = currentUserId();
      // O aparelho passou a ser de outra pessoa (outro login no mesmo iPhone): sai da conta anterior
      await asSystem(() => prisma.pushSubscription.deleteMany({ where: { endpoint, userId: { not: userId } } }));
      await prisma.pushSubscription.upsert({
        where: { endpoint },
        create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: request.headers['user-agent'] },
        update: { p256dh: keys.p256dh, auth: keys.auth, lastError: null, lastErrorAt: null },
      });
      return { ok: true };
    });

    auth.delete('/push/subscribe', async (request, reply) => {
      const body = z.object({ endpoint: z.string() }).safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Dados inválidos' });
      await prisma.pushSubscription.deleteMany({ where: { endpoint: body.data.endpoint } });
      return { ok: true };
    });

    auth.get('/push/status', async () => {
      const subs = await prisma.pushSubscription.findMany({
        select: { endpoint: true, userAgent: true, createdAt: true, lastSuccessAt: true, lastError: true },
        orderBy: { createdAt: 'desc' },
      });
      return { subscriptions: subs };
    });

    auth.post('/push/test', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async () => {
      const badge = await unreviewedCount();
      const result = await sendToAll(
        {
          title: 'Notificação de teste',
          body: `Tudo certo! Exemplo: compra de ${formatBRL(4590)} em Padaria — Alimentação`,
          url: '/ajustes/notificacoes',
          tag: 'test',
          badge,
        },
        prismaSubscriptionStore,
        sender,
      );
      return result;
    });

    auth.get('/badge', async () => ({ count: await unreviewedCount() }));
  });
}
