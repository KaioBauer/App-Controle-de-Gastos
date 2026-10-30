import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Isolamento entre usuários: toda tabela com dono (`userId`) só é lida e escrita dentro de um
 * contexto de usuário, e o filtro é colocado aqui, em toda consulta. Nenhuma rota precisa
 * lembrar de filtrar, e esquecer o contexto é erro, não vazamento.
 *
 *  - Requisições logadas: o contexto é aberto pelo plugin de sessão.
 *  - Tarefas em segundo plano: `runAsUser(userId, fn)` para cada usuário.
 *  - Consultas que cruzam usuários de propósito (achar o dono de uma conexão, listar usuários):
 *    `asSystem(fn)`, sem filtro.
 */
type Scope = { userId: string } | { system: true };
const scope = new AsyncLocalStorage<Scope>();

const OWNED = new Set<string>([
  'PushSubscription',
  'Category',
  'CategoryRule',
  'PluggyItem',
  'Account',
  'CreditCardBill',
  'Investment',
  'Goal',
  'GoalContribution',
  'Bill',
  'BillPayment',
  'DismissedSuggestion',
  'Transaction',
  'Budget',
  'NotificationSettings',
  'NotificationOutbox',
] satisfies Prisma.ModelName[]);

const WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);

export class NoUserScopeError extends Error {
  constructor(model: string, operation: string) {
    super(`Consulta em ${model}.${operation} fora de um contexto de usuário`);
  }
}

const base = new PrismaClient();

export const prisma = base.$extends({
  name: 'user-scope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!OWNED.has(model)) return query(args);
        const current = scope.getStore();
        if (!current) throw new NoUserScopeError(model, operation);
        if ('system' in current) return query(args);
        const { userId } = current;
        const a = args as Record<string, unknown>;
        if (WHERE_OPS.has(operation)) a.where = { ...(a.where as object), userId };
        if (operation === 'create') a.data = { ...(a.data as object), userId };
        if (operation === 'upsert') a.create = { ...(a.create as object), userId };
        if (operation === 'createMany' || operation === 'createManyAndReturn') {
          const data = a.data as object | object[];
          a.data = Array.isArray(data) ? data.map((d) => ({ ...d, userId })) : { ...data, userId };
        }
        return query(a as typeof args);
      },
    },
  },
});

export type Db = typeof prisma;

export function runAsUser<T>(userId: string, fn: () => T): T {
  return scope.run({ userId }, fn);
}

export function asSystem<T>(fn: () => T): T {
  return scope.run({ system: true }, fn);
}

/** Usuário do contexto atual (para chaves compostas como userId + nome). */
export function currentUserId(): string {
  const current = scope.getStore();
  if (!current || 'system' in current) throw new Error('Sem usuário no contexto');
  return current.userId;
}

/**
 * Roda `fn` uma vez para cada usuário, no contexto dele (jobs agendados).
 * O erro de um usuário não impede os outros.
 */
export async function forEachUser(fn: (userId: string) => Promise<unknown>, onError?: (err: unknown, userId: string) => void) {
  const users = await asSystem(() => prisma.user.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } }));
  for (const { id } of users) {
    try {
      await runAsUser(id, () => fn(id));
    } catch (err) {
      onError?.(err, id);
    }
  }
}

/** Abre o contexto do usuário até o fim da requisição (usado pelo plugin de sessão). */
export function enterUserScope(userId: string | null, done: () => void) {
  if (userId) scope.run({ userId }, done);
  else done();
}
