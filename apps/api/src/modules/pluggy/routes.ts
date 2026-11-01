import { timingSafeEqual } from 'node:crypto';
import type { ConnectionsDTO } from '@financas/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { connectionHealth } from '../../domain/connection-health';
import type { Env } from '../../env';
import { asSystem, currentUserId, prisma } from '../../lib/db';
import { requireAuth } from '../../plugins/session';
import { encryptSecret } from '../../lib/crypto';
import { PluggyClient, PluggyError } from './client';
import type { PluggyClients } from './clients';
import { syncAll, syncItem } from './sync';

export const WEBHOOK_PATH = '/api/webhooks/pluggy';
const WEBHOOK_HEADER = 'x-webhook-secret';

/** Eventos que indicam dados novos ou mudança de status da conexão. */
const SYNC_EVENTS = new Set([
  'item/updated',
  'item/error',
  'item/login_succeeded',
  'item/waiting_user_action',
  'transactions/created',
  'transactions/updated',
  'transactions/deleted',
]);

/** Ao abrir o app, copia de novo da Pluggy se a última cópia tiver mais que isso. */
const REFRESH_AFTER_MS = 15 * 60 * 1000;

const itemIdBody = z.object({ itemId: z.string().trim().uuid('O itemId é um UUID (ex.: 3f2b…-…)') });

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const credentialsBody = z.object({
  clientId: z.string().trim().uuid('O Client ID é um UUID (ex.: 3f2b…-…)'),
  clientSecret: z.string().trim().min(10, 'Client Secret inválido').max(200),
});

export async function pluggyRoutes(app: FastifyInstance, { env, clients }: { env: Env; clients: PluggyClients }) {
  /** Cria (ou recria) o webhook da Pluggy nestas credenciais, apontando para este servidor. */
  const registerWebhook = async (pluggy: PluggyClient) => {
    if (!env.PLUGGY_WEBHOOK_SECRET) throw Object.assign(new Error('Defina PLUGGY_WEBHOOK_SECRET no .env'), { statusCode: 400 });
    if (!env.APP_ORIGIN.startsWith('https://')) {
      throw Object.assign(new Error('O webhook precisa de uma URL pública HTTPS (APP_ORIGIN)'), { statusCode: 400 });
    }
    const url = `${env.APP_ORIGIN}${WEBHOOK_PATH}`;
    const existing = await pluggy.listWebhooks();
    for (const w of existing.results.filter((w) => w.url === url)) await pluggy.deleteWebhook(w.id);
    await pluggy.createWebhook(url, { [WEBHOOK_HEADER]: env.PLUGGY_WEBHOOK_SECRET });
    return url;
  };

  // ---------- Webhook (público, chamado pela Pluggy) ----------
  app.post(
    '/webhooks/pluggy',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const secret = env.PLUGGY_WEBHOOK_SECRET;
      const given = request.headers[WEBHOOK_HEADER];
      // 401 não é reenviado pela Pluggy: só para requisições que nunca aceitaremos
      if (!secret || typeof given !== 'string' || !safeEqual(given, secret)) {
        return reply.code(401).send({ error: 'Não autorizado' });
      }
      const body = z
        .object({ event: z.string(), eventId: z.string().optional(), itemId: z.string().optional() })
        .passthrough()
        .safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Payload inválido' });
      const { event, eventId, itemId } = body.data;

      if (eventId) {
        // Reenvio do mesmo evento: já tratado
        const fresh = await prisma.webhookEvent
          .create({ data: { eventId, event, itemId } })
          .then(() => true)
          .catch(() => false);
        if (!fresh) return { ok: true, duplicate: true };
      }

      // Responde já (a Pluggy espera 2xx em até 10s) e sincroniza em segundo plano
      if (itemId && SYNC_EVENTS.has(event)) {
        // O webhook não tem usuário: procura a conexão em todas as contas (o sync roda no dono dela)
        const known = await asSystem(() => prisma.pluggyItem.findUnique({ where: { id: itemId }, select: { id: true } }));
        if (known) {
          syncItem(clients, itemId, request.log).catch((err) => request.log.error({ err, itemId, event }, 'Sync via webhook falhou'));
        }
      }
      if (itemId && event === 'item/deleted') {
        await asSystem(() =>
          prisma.pluggyItem.updateMany({ where: { id: itemId }, data: { status: 'DELETED', errorMessage: 'Conexão removida no Meu Pluggy' } }),
        );
      }
      return { ok: true };
    },
  );

  // ---------- Telas de configuração (autenticadas) ----------
  app.register(async (auth) => {
    auth.addHook('preHandler', requireAuth);

    const requireClient = async () => {
      const client = await clients.forCurrentUser();
      if (!client) {
        throw Object.assign(new Error('Cadastre o Client ID e o Client Secret do seu Meu Pluggy acima'), { statusCode: 400 });
      }
      return client;
    };

    // ---------- Credenciais do Meu Pluggy do usuário ----------
    auth.get('/pluggy/credentials', async () => ({
      canStore: clients.canStoreCredentials,
      ...(await clients.sourceForCurrentUser()),
    }));

    auth.put('/pluggy/credentials', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
      if (!env.CREDENTIALS_KEY) return reply.code(400).send({ error: 'O servidor não está configurado para guardar credenciais (CREDENTIALS_KEY)' });
      const body = credentialsBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos' });
      const { clientId, clientSecret } = body.data;
      // Confere na Pluggy antes de guardar
      const candidate = new PluggyClient(clientId, clientSecret);
      try {
        await candidate.listWebhooks();
      } catch (err) {
        if (err instanceof PluggyError && (err.status === 400 || err.status === 401 || err.status === 403)) {
          return reply.code(400).send({ error: 'A Pluggy não aceitou essas credenciais. Confira o Client ID e o Client Secret.' });
        }
        throw err;
      }
      const userId = currentUserId();
      const secretEnc = encryptSecret(clientSecret, env.CREDENTIALS_KEY);
      await prisma.pluggyCredential.upsert({ where: { userId }, create: { userId, clientId, secretEnc }, update: { clientId, secretEnc } });
      // Com o webhook, os dados chegam na hora; sem ele, o sync de hora em hora cobre
      let webhook = true;
      try {
        await registerWebhook(candidate);
      } catch (err) {
        webhook = false;
        request.log.warn({ err }, 'Webhook da Pluggy não registrado para as novas credenciais');
      }
      return { ok: true, webhook };
    });

    auth.delete('/pluggy/credentials', async () => {
      await prisma.pluggyCredential.deleteMany({ where: { userId: currentUserId() } });
      return { ok: true };
    });

    auth.get('/pluggy/connections', async (): Promise<ConnectionsDTO> => {
      const now = new Date();
      const items = await prisma.pluggyItem.findMany({
        include: { accounts: { orderBy: [{ type: 'asc' }, { name: 'asc' }] } },
        orderBy: { createdAt: 'asc' },
      });
      return {
        configured: !!(await clients.forCurrentUser()),
        webhookConfigured: !!env.PLUGGY_WEBHOOK_SECRET,
        connections: items.map((i) => ({
          itemId: i.id,
          connectorName: i.connectorName || 'Conexão',
          connectorImage: i.connectorImage,
          health: connectionHealth(i, now),
          status: i.status,
          errorMessage: i.errorMessage,
          lastSyncError: i.lastSyncError,
          consentExpiresAt: i.consentExpiresAt?.toISOString() ?? null,
          lastSyncAt: i.lastSyncAt?.toISOString() ?? null,
          accounts: i.accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, balanceCents: Number(a.balanceCents) })),
        })),
      };
    });

    // Cadastra um itemId do Meu Pluggy e faz a primeira sincronização
    auth.post('/pluggy/connections', async (request, reply) => {
      const pluggy = await requireClient();
      const body = itemIdBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'itemId inválido' });
      const { itemId } = body.data;

      try {
        await pluggy.getItem(itemId);
      } catch (err) {
        if (err instanceof PluggyError && (err.status === 404 || err.status === 401 || err.status === 403)) {
          return reply.code(400).send({
            error: 'Item não encontrado ou sem acesso por estas credenciais. Se a conexão é de outra conta do Meu Pluggy, cadastre o Client ID e o Client Secret dela acima.',
          });
        }
        throw err;
      }

      const userId = currentUserId();
      const owner = await asSystem(() => prisma.pluggyItem.findUnique({ where: { id: itemId }, select: { userId: true } }));
      if (owner && owner.userId !== userId) {
        return reply.code(400).send({ error: 'Esta conexão já está cadastrada em outra conta do Kaixa' });
      }
      await prisma.pluggyItem.upsert({ where: { id: itemId }, create: { userId, id: itemId }, update: {} });
      try {
        const result = await syncItem(clients, itemId, request.log);
        return reply.code(201).send(result);
      } catch (err) {
        // A conexão fica salva; o erro aparece na tela e o job tenta de novo
        return reply.code(201).send({ itemId, error: (err as Error).message });
      }
    });

    auth.delete('/pluggy/connections/:itemId', async (request) => {
      const { itemId } = request.params as { itemId: string };
      // Remove a conexão daqui (contas e transações dela junto); no Meu Pluggy nada muda
      await prisma.pluggyItem.deleteMany({ where: { id: itemId } });
      return { ok: true };
    });

    auth.post(
      '/pluggy/connections/:itemId/sync',
      { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
      async (request) => {
        const { itemId } = request.params as { itemId: string };
        return syncItem(clients, itemId, request.log);
      },
    );

    /**
     * Chamado pelo app ao abrir: copia o que a Pluggy tem de novo se a última cópia ficou velha.
     * (Conexões do Meu Pluggy não aceitam pedido de atualização: o Meu Pluggy busca no banco
     * no ritmo dele, e o webhook e o job de hora em hora trazem o resto.)
     */
    auth.post('/pluggy/refresh', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (request) => {
      const staleBefore = new Date(Date.now() - REFRESH_AFTER_MS);
      const items = await prisma.pluggyItem.findMany({
        where: { OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: staleBefore } }] },
        select: { id: true },
      });
      let created = 0;
      for (const { id } of items) {
        await syncItem(clients, id, request.log).then(
          (r) => {
            created += r.created;
          },
          (err) => request.log.warn({ err, itemId: id }, 'Atualização ao abrir o app falhou'),
        );
      }
      return { synced: items.length, created };
    });

    auth.post('/pluggy/sync', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request) => {
      // Só as conexões do usuário da sessão
      const items = await prisma.pluggyItem.findMany({ select: { id: true } });
      let synced = 0;
      for (const { id } of items) {
        await syncItem(clients, id, request.log).then(
          () => synced++,
          (err) => request.log.error({ err, itemId: id }, 'Falha ao sincronizar item da Pluggy'),
        );
      }
      return { synced };
    });

    // Registra (ou recria) o webhook da Pluggy apontando para este servidor
    auth.post('/pluggy/webhook', async () => {
      const url = await registerWebhook(await requireClient());
      return { ok: true, url };
    });
  });
}
