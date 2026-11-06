import { describe, expect, it } from 'vitest';
import { asSystem, currentUserId, runAsUser } from './db';

/** Imita uma consulta do Prisma: só executa quando alguém chama `.then`. */
const lazy = <T>(run: () => T): PromiseLike<T> => ({
  then: (ok, fail) => Promise.resolve().then(run).then(ok, fail),
});

describe('contexto de usuário', () => {
  it('runAsUser executa consultas preguiçosas dentro do contexto do usuário', async () => {
    await expect(runAsUser('u1', () => lazy(() => currentUserId()))).resolves.toBe('u1');
  });

  it('asSystem executa consultas preguiçosas dentro do contexto de sistema', async () => {
    // currentUserId lança "Sem usuário no contexto" no contexto de sistema, e não fora de contexto
    await expect(runAsUser('u1', () => asSystem(() => lazy(() => currentUserId())))).rejects.toThrow('Sem usuário no contexto');
  });
});
