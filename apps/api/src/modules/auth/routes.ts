import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../../env';
import { prisma } from '../../lib/db';
import { createSession, destroySession, requireAuth } from '../../plugins/session';

const loginBody = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(500),
});

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

  app.get('/auth/me', { preHandler: requireAuth }, async (request) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.userId! } });
    return { username: user.username };
  });
}
