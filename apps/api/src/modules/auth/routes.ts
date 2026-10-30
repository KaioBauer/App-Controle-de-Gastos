import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../../env';
import { prisma } from '../../lib/db';
import { createSession, destroySession, requireAuth, requireSession, setSessionLock } from '../../plugins/session';

const loginBody = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(500),
});

/** Volta rápida (central de notificações, compartilhar, trocar de app por um instante) não bloqueia. */
export const LOCK_GRACE_MS = 3000;

// Hash fixo usado quando o usuário não existe, para que o tempo de resposta não revele isso
let dummyHash: Promise<string> | null = null;

export async function authRoutes(app: FastifyInstance, { env }: { env: Env }) {
  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = loginBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Dados inválidos' });

      const user = await prisma.user.findUnique({ where: { username: body.data.username } });
      dummyHash ??= argon2.hash('dummy-password-for-timing');
      const ok = await argon2.verify(user?.passwordHash ?? (await dummyHash), body.data.password);
      if (!user || !ok) return reply.code(401).send({ error: 'Usuário ou senha incorretos' });

      await createSession(env, reply, user.id, request.headers['user-agent']);
      return { username: user.username };
    },
  );

  app.post('/auth/logout', async (request, reply) => {
    await destroySession(env, request, reply);
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: requireSession }, async (request) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: request.userId! },
      include: { _count: { select: { passkeys: true } } },
    });
    return {
      username: user.username,
      locked: request.locked,
      appLock: user.appLock && user._count.passkeys > 0,
    };
  });

  // ---------- Bloqueio do app (Face ID ao abrir e ao voltar) ----------
  app.post('/auth/lock', { preHandler: requireSession }, async (request) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: request.userId! },
      include: { _count: { select: { passkeys: true } } },
    });
    if (!user.appLock || user._count.passkeys === 0) return { locked: false };
    if (!request.locked) await setSessionLock(request.sessionId!, true);
    return { locked: true };
  });

  /** Desfaz o bloqueio só se ele acabou de acontecer (o app voltou dentro da tolerância). */
  app.post('/auth/lock/resume', { preHandler: requireSession }, async (request) => {
    const session = await prisma.session.findUniqueOrThrow({ where: { id: request.sessionId! } });
    if (session.lockedAt && Date.now() - session.lockedAt.getTime() <= LOCK_GRACE_MS) {
      await setSessionLock(session.id, false);
      return { locked: false };
    }
    return { locked: session.lockedAt !== null };
  });

  app.post(
    '/auth/unlock/password',
    { preHandler: requireSession, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = z.object({ password: z.string().min(1).max(500) }).safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Dados inválidos' });
      const user = await prisma.user.findUniqueOrThrow({ where: { id: request.userId! } });
      if (!(await argon2.verify(user.passwordHash, body.data.password))) return reply.code(401).send({ error: 'Senha incorreta' });
      await setSessionLock(request.sessionId!, false);
      return { locked: false };
    },
  );

  app.put('/auth/app-lock', { preHandler: requireAuth }, async (request, reply) => {
    const body = z.object({ enabled: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Dados inválidos' });
    if (body.data.enabled && (await prisma.passkey.count({ where: { userId: request.userId! } })) === 0) {
      return reply.code(400).send({ error: 'Cadastre o Face ID primeiro.' });
    }
    await prisma.user.update({ where: { id: request.userId! }, data: { appLock: body.data.enabled } });
    return { appLock: body.data.enabled };
  });
}
