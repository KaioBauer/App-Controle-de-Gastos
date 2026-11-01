import { buildApp } from './app';
import { loadEnv } from './env';
import { startScheduler } from './jobs/scheduler';
import { forEachUser, prisma } from './lib/db';
import { autoPayBills } from './modules/finance/bills';
import { ensureDefaults } from './modules/finance/defaults';
import { Notifier } from './modules/notifications/service';
import { PluggyClient } from './modules/pluggy/client';
import { PluggyClients } from './modules/pluggy/clients';
import { onSyncFinished, settleOwnTransfers } from './modules/pluggy/sync';
import { createWebPushSender } from './modules/push/service';

const env = loadEnv();
// Para cada usuário: categorias e conta "Dinheiro" (idempotente) e a regra atual de
// transferências próprias aplicada aos dados já sincronizados
await forEachUser(
  async () => {
    await ensureDefaults();
    await settleOwnTransfers();
  },
  (err, userId) => console.error('Falha ao preparar os dados do usuário', userId, err),
);
const pluggy =
  env.PLUGGY_CLIENT_ID && env.PLUGGY_CLIENT_SECRET ? new PluggyClient(env.PLUGGY_CLIENT_ID, env.PLUGGY_CLIENT_SECRET) : null;
// Credenciais de cada usuário (Ajustes › Conexões); o par do .env vale para quem não cadastrou
const clients = new PluggyClients(env, pluggy);
const app = await buildApp(env, clients);
if (!pluggy) app.log.info('Sem PLUGGY_CLIENT_ID/SECRET no .env: cada usuário usa as próprias credenciais');
if (!env.CREDENTIALS_KEY) app.log.warn('Sem CREDENTIALS_KEY no .env: não dá para guardar credenciais da Pluggy por usuário');

// Notificações: avaliadas ao fim de cada sync e nos horários agendados
const notifier = new Notifier(createWebPushSender(env), app.log);
onSyncFinished(async (result) => {
  // Baixa automática das contas antes dos avisos (uma conta já paga não deve avisar vencimento)
  await autoPayBills();
  await notifier.afterSync(result);
});
const stopScheduler = startScheduler(clients, notifier, app.log);

const shutdown = async () => {
  stopScheduler();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ host: '0.0.0.0', port: env.PORT });
