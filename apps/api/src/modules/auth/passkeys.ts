import { randomBytes } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Passkey } from '@prisma/client';
import { z } from 'zod';
import type { Env } from '../../env';
import { prisma } from '../../lib/db';
import { createSession, requireAuth, requireSession, setSessionLock } from '../../plugins/session';

/** Desafios pendentes (instância única da API): id do desafio -> desafio e validade */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const challenges = new Map<string, { challenge: string; userId?: string; expires: number }>();
const CHALLENGE_COOKIE = 'pk_chal';

function remember(reply: FastifyReply, env: Env, challenge: string, userId?: string) {
  const now = Date.now();
  for (const [k, v] of challenges) if (v.expires < now) challenges.delete(k);
  const id = randomBytes(18).toString('base64url');
  challenges.set(id, { challenge, userId, expires: now + CHALLENGE_TTL_MS });
  reply.setCookie(CHALLENGE_COOKIE, id, {
    path: '/api/auth',
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    maxAge: CHALLENGE_TTL_MS / 1000,
  });
}

/** Desafio de uso único: sai do mapa ao ser lido. */
function take(request: FastifyRequest, reply: FastifyReply) {
  const id = request.cookies[CHALLENGE_COOKIE];
  reply.clearCookie(CHALLENGE_COOKIE, { path: '/api/auth' });
  if (!id) return null;
  const entry = challenges.get(id);
  challenges.delete(id);
  return entry && entry.expires > Date.now() ? entry : null;
}

function deviceFromUA(ua?: string) {
  if (!ua) return 'Aparelho';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac OS/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Navegador';
}

export async function passkeyRoutes(app: FastifyInstance, { env }: { env: Env }) {
  const origin = env.APP_ORIGIN;
  const rpID = new URL(origin).hostname;

  // ---------- Cadastro (já logado com senha) ----------
  app.post('/auth/passkey/register/options', { preHandler: requireAuth }, async (request, reply) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.userId! }, include: { passkeys: true } });
    const options = await generateRegistrationOptions({
      rpName: 'Kaixa',
      rpID,
      userName: user.username,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      // Não cadastra de novo um autenticador que já tem passkey
      excludeCredentials: user.passkeys.map((p) => ({ id: p.id, transports: p.transports as AuthenticatorTransportFuture[] })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    remember(reply, env, options.challenge, user.id);
    return options;
  });

  app.post('/auth/passkey/register/verify', { preHandler: requireAuth }, async (request, reply) => {
    const pending = take(request, reply);
    if (!pending || pending.userId !== request.userId) return reply.code(400).send({ error: 'Pedido expirado. Tente de novo.' });
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: request.body as RegistrationResponseJSON,
        expectedChallenge: pending.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch (err) {
      // Detalhe técnico só no log: para o usuário, uma mensagem clara
      request.log.warn({ err }, 'Cadastro de passkey recusado');
      return reply.code(400).send({ error: 'Não foi possível cadastrar a passkey. Tente de novo.' });
    }
    if (!verification.verified) return reply.code(400).send({ error: 'Não foi possível verificar a passkey' });
    const { credential } = verification.registrationInfo;
    await prisma.passkey.create({
      data: {
        id: credential.id,
        userId: request.userId!,
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: credential.transports ?? [],
        deviceName: deviceFromUA(request.headers['user-agent']),
      },
    });
    // Com Face ID cadastrado, o app passa a pedir o Face ID ao abrir
    await prisma.user.update({ where: { id: request.userId! }, data: { appLock: true } });
    return { ok: true };
  });

  app.get('/auth/passkeys', { preHandler: requireAuth }, async (request) => {
    const keys = await prisma.passkey.findMany({ where: { userId: request.userId! }, orderBy: { createdAt: 'asc' } });
    return keys.map((k) => ({ id: k.id, deviceName: k.deviceName, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt }));
  });

  app.delete('/auth/passkeys/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    await prisma.passkey.deleteMany({ where: { id, userId: request.userId! } });
    // Sem passkey não há como desbloquear com Face ID: o bloqueio desliga
    if ((await prisma.passkey.count({ where: { userId: request.userId! } })) === 0) {
      await prisma.user.update({ where: { id: request.userId! }, data: { appLock: false } });
    }
    return { ok: true };
  });

  // ---------- Login (sem senha) ----------
  app.post('/auth/passkey/login/options', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (_request, reply) => {
    // Sem allowCredentials: o iPhone oferece as passkeys salvas para este site (descoberta)
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
    remember(reply, env, options.challenge);
    return options;
  });

  app.post('/auth/passkey/login/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const pending = take(request, reply);
    if (!pending) return reply.code(400).send({ error: 'Pedido expirado. Tente de novo.' });
    const body = z.object({ id: z.string().min(1) }).passthrough().safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Resposta inválida' });
    const passkey = await prisma.passkey.findUnique({ where: { id: body.data.id } });
    if (!passkey) return reply.code(401).send({ error: 'Passkey não reconhecida. Entre com a senha e cadastre de novo.' });

    if (!(await verifyAssertion(request, pending.challenge, passkey))) {
      return reply.code(401).send({ error: 'Não foi possível entrar com a passkey. Tente de novo ou use a senha.' });
    }
    await createSession(env, reply, passkey.userId, request.headers['user-agent']);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: passkey.userId } });
    return { username: user.username };
  });

  // ---------- Desbloqueio do app (sessão existente, só as passkeys do próprio usuário) ----------
  app.post(
    '/auth/unlock/options',
    { preHandler: requireSession, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const keys = await prisma.passkey.findMany({ where: { userId: request.userId! } });
      if (keys.length === 0) return reply.code(400).send({ error: 'Nenhum Face ID cadastrado. Use a senha.' });
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: 'required',
        allowCredentials: keys.map((k) => ({ id: k.id, transports: k.transports as AuthenticatorTransportFuture[] })),
      });
      remember(reply, env, options.challenge, request.userId!);
      return options;
    },
  );

  app.post(
    '/auth/unlock/verify',
    { preHandler: requireSession, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const pending = take(request, reply);
      if (!pending || pending.userId !== request.userId) return reply.code(400).send({ error: 'Pedido expirado. Tente de novo.' });
      const body = z.object({ id: z.string().min(1) }).passthrough().safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Resposta inválida' });
      const passkey = await prisma.passkey.findUnique({ where: { id: body.data.id } });
      if (!passkey || passkey.userId !== request.userId || !(await verifyAssertion(request, pending.challenge, passkey))) {
        return reply.code(401).send({ error: 'Não foi possível desbloquear. Tente de novo ou use a senha.' });
      }
      await setSessionLock(request.sessionId!, false);
      return { locked: false };
    },
  );

  /** Confere a resposta do Face ID e atualiza o contador da passkey. */
  async function verifyAssertion(request: FastifyRequest, challenge: string, passkey: Passkey) {
    try {
      const verification = await verifyAuthenticationResponse({
        response: request.body as AuthenticationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: passkey.id,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: Number(passkey.counter),
          transports: passkey.transports as AuthenticatorTransportFuture[],
        },
      });
      if (!verification.verified) return false;
      await prisma.passkey.update({
        where: { id: passkey.id },
        data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
      });
      return true;
    } catch (err) {
      request.log.warn({ err }, 'Verificação de passkey recusada');
      return false;
    }
  }
}
