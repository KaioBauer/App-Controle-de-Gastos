import { timingSafeEqual } from 'node:crypto';
import type { ConnectionsDTO } from '@financas/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { connectionHealth } from '../../domain/connection-health';
import type { Env } from '../../env';
import { asSystem, currentUserId, prisma } from '../../lib/db';
import { requireAuth } from '../../plugins/session';
import { PluggyError, type PluggyClient } from './client';
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

const itemIdBody = z.object({ itemId: z.string().trim().uuid('O itemId é um UUID (ex.: 3f2b…-…)') });

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function pluggyRoutes(app: FastifyInstance, { env, client }: { env: Env; client: PluggyClient | null }) {
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
      if (client && itemId && SYNC_EVENTS.has(event)) {
        // O webhook não tem usuário: procura a conexão em todas as contas (o sync roda no dono dela)
        const known = await asSystem(() => prisma.pluggyItem.findUnique({ where: { id: itemId }, select: { id: true } }));
        if (known) {
          syncItem(client, itemId, request.log).catch((err) => request.log.error({ err, itemId, event }, 'Sync via webhook falhou'));
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

    const requireClient = () => {
      if (!client) throw Object.assign(new Error('Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env'), { statusCode: 400 });
      return client;
    };

    auth.get('/pluggy/connections', async (): Promise<ConnectionsDTO> => {
      const now = new Date();
      const items = await prisma.pluggyItem.findMany({
        include: { accounts: { orderBy: [{ type: 'asc' }, { name: 'asc' }] } },
        orderBy: { createdAt: 'asc' },
      });
      return {
        configured: !!client,
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
      const pluggy = requireClient();
      const body = itemIdBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'itemId inválido' });
      const { itemId } = body.data;

      try {
        await pluggy.getItem(itemId);
      } catch (err) {
        if (err instanceof PluggyError && (err.status === 404 || err.status === 401 || err.status === 403)) {
          return reply.code(400).send({ error: 'Item não encontrado ou sem acesso por estas credenciais' });
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
        const result = await syncItem(pluggy, itemId, request.log);
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
        return syncItem(requireClient(), itemId, request.log);
      },
    );

    auth.post('/pluggy/sync', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request) => {
      const results = await syncAll(requireClient(), request.log);
      return { synced: results.length };
    });

    // Registra (ou recria) o webhook da Pluggy apontando para este servidor
    auth.post('/pluggy/webhook', async (request, reply) => {
      const pluggy = requireClient();
      if (!env.PLUGGY_WEBHOOK_SECRET) return reply.code(400).send({ error: 'Defina PLUGGY_WEBHOOK_SECRET no .env' });
      if (!env.APP_ORIGIN.startsWith('https://')) {
        return reply.code(400).send({ error: 'O webhook precisa de uma URL pública HTTPS (APP_ORIGIN)' });
      }
      const url = `${env.APP_ORIGIN}${WEBHOOK_PATH}`;
      const existing = await pluggy.listWebhooks();
      for (const w of existing.results.filter((w) => w.url === url)) await pluggy.deleteWebhook(w.id);
      await pluggy.createWebhook(url, { [WEBHOOK_HEADER]: env.PLUGGY_WEBHOOK_SECRET });
      return { ok: true, url };
    });
  });
}
