import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import type { Env } from './env';
import { authRoutes } from './modules/auth/routes';
import { billRoutes } from './modules/finance/bills';
import { cardRoutes } from './modules/finance/cards';
import { categoryRoutes } from './modules/finance/categories';
import { goalRoutes } from './modules/finance/goals';
import { reportRoutes } from './modules/finance/reports';
import { financeRoutes } from './modules/finance/routes';
import { transactionRoutes } from './modules/finance/transactions';
import { notificationRoutes } from './modules/notifications/routes';
import type { PluggyClient } from './modules/pluggy/client';
import { pluggyRoutes } from './modules/pluggy/routes';
import { pushRoutes } from './modules/push/routes';
import { registerSession } from './plugins/session';

export async function buildApp(env: Env, pluggy: PluggyClient | null) {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      redact: ['req.headers.cookie', 'req.headers["x-webhook-secret"]'],
    },
    // Atrás do Nginx: usa X-Forwarded-For para IP real (rate limit)
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });

  // BigInt (centavos no Prisma) não é serializável por padrão; inteiros até 2^53 cabem em number
  app.setReplySerializer((payload) =>
    JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)),
  );

  await app.register(cookie);
  await app.register(cors, { origin: env.APP_ORIGIN, credentials: true });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  registerSession(app, env);

  await app.register(
    async (api) => {
      api.get('/health', async () => ({ ok: true }));
      await api.register(authRoutes, { env });
      await api.register(pushRoutes, { env });
      await api.register(financeRoutes);
      await api.register(cardRoutes);
      await api.register(transactionRoutes);
      await api.register(billRoutes);
      await api.register(reportRoutes);
      await api.register(goalRoutes);
      await api.register(categoryRoutes);
      await api.register(notificationRoutes);
      await api.register(pluggyRoutes, { env, client: pluggy });
    },
    { prefix: '/api' },
  );

  return app;
}
