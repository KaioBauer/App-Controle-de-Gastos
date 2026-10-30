import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Env } from '../env';
import { enterUserScope, prisma } from '../lib/db';

export const SESSION_COOKIE = 'sid';
const DAY_MS = 24 * 60 * 60 * 1000;
// Renova a validade no máximo uma vez por dia para não escrever no banco a cada request
const TOUCH_INTERVAL_MS = DAY_MS;

declare module 'fastify' {
  interface FastifyRequest {
    userId: string | null;
    sessionId: string | null;
    /** Sessão válida, mas bloqueada até o Face ID (ou a senha) */
    locked: boolean;
  }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function cookieOptions(env: Env, maxAgeSeconds: number) {
  return {
    path: '/',
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict' as const,
    maxAge: maxAgeSeconds,
  };
}

export async function createSession(env: Env, reply: FastifyReply, userId: string, userAgent?: string) {
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId,
      userAgent: userAgent?.slice(0, 300),
      expiresAt: new Date(Date.now() + env.SESSION_DAYS * DAY_MS),
    },
  });
  reply.setCookie(SESSION_COOKIE, token, cookieOptions(env, env.SESSION_DAYS * 24 * 60 * 60));
}

export async function destroySession(env: Env, request: FastifyRequest, reply: FastifyReply) {
  if (request.sessionId) await prisma.session.deleteMany({ where: { id: request.sessionId } });
  reply.clearCookie(SESSION_COOKIE, cookieOptions(env, 0));
}

/** Resolve a sessão do cookie em todas as requisições e renova a validade (sessão deslizante). */
export function registerSession(app: FastifyInstance, env: Env) {
  app.decorateRequest('userId', null);
  app.decorateRequest('sessionId', null);
  app.decorateRequest('locked', false);

  app.addHook('onRequest', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    const id = hashToken(token);
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session || session.expiresAt < new Date()) {
      if (session) await prisma.session.delete({ where: { id } }).catch(() => {});
      reply.clearCookie(SESSION_COOKIE, cookieOptions(env, 0));
      return;
    }
    request.userId = session.userId;
    request.sessionId = id;
    request.locked = session.lockedAt !== null;

    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await prisma.session.update({
        where: { id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + env.SESSION_DAYS * DAY_MS) },
      });
      reply.setCookie(SESSION_COOKIE, token, cookieOptions(env, env.SESSION_DAYS * 24 * 60 * 60));
    }
  });

  // Daqui em diante, toda consulta da requisição enxerga só os dados deste usuário (ver lib/db.ts)
  app.addHook('preHandler', (request, _reply, done) => enterUserScope(request.userId, done));
}

/** Sessão desbloqueada: exigido por todas as rotas com dados. */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.userId) return reply.code(401).send({ error: 'Não autenticado' });
  if (request.locked) return reply.code(423).send({ error: 'App bloqueado' });
}

/** Qualquer sessão válida, mesmo bloqueada (rotas de bloqueio e desbloqueio). */
export async function requireSession(request: FastifyRequest, reply: FastifyReply) {
  if (!request.userId) return reply.code(401).send({ error: 'Não autenticado' });
}

export async function setSessionLock(sessionId: string, locked: boolean) {
  await prisma.session.update({ where: { id: sessionId }, data: { lockedAt: locked ? new Date() : null } });
}
