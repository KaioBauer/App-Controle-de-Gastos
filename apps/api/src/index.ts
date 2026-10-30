import { buildApp } from './app';
import { loadEnv } from './env';
import { startScheduler } from './jobs/scheduler';
import { prisma } from './lib/db';
import { ensureDefaults } from './modules/finance/defaults';
import { Notifier } from './modules/notifications/service';
import { PluggyClient } from './modules/pluggy/client';
import { onSyncFinished } from './modules/pluggy/sync';
import { createWebPushSender } from './modules/push/service';

const env = loadEnv();
await ensureDefaults();
const pluggy =
  env.PLUGGY_CLIENT_ID && env.PLUGGY_CLIENT_SECRET ? new PluggyClient(env.PLUGGY_CLIENT_ID, env.PLUGGY_CLIENT_SECRET) : null;
const app = await buildApp(env, pluggy);
if (!pluggy) app.log.warn('Pluggy desativada: defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env');

// Notificações: avaliadas ao fim de cada sync e nos horários agendados
const notifier = new Notifier(createWebPushSender(env), app.log);
onSyncFinished((result) => notifier.afterSync(result));
const stopScheduler = startScheduler(pluggy, notifier, app.log);

const shutdown = async () => {
  stopScheduler();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ host: '0.0.0.0', port: env.PORT });
