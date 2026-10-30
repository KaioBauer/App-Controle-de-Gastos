import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/db';
import { requireAuth } from '../../plugins/session';
import { toCategoryDTO } from './queries';

/** Ícones disponíveis no app (ver apps/web/src/ui/icons.tsx) */
export const CATEGORY_ICON_KEYS = [
  'food', 'cart', 'bus', 'car', 'fuel', 'home', 'bolt', 'water', 'wifi', 'phone', 'subs', 'fun', 'game', 'travel', 'health',
  'fitness', 'shopping', 'clothes', 'education', 'book', 'pet', 'baby', 'gift', 'coffee', 'beauty', 'work', 'savings', 'tools',
  'income', 'transfer', 'other',
] as const;

const body = z.object({
  name: z.string().trim().min(1).max(40),
  icon: z.enum(CATEGORY_ICON_KEYS),
});

export async function categoryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/categories', async (request, reply) => {
    const b = body.extend({ kind: z.enum(['EXPENSE', 'INCOME']) }).safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'Dados inválidos' });
    const exists = await prisma.category.findFirst({ where: { name: { equals: b.data.name, mode: 'insensitive' } } });
    if (exists) return reply.code(400).send({ error: 'Já existe uma categoria com esse nome' });
    const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
    const c = await prisma.category.create({ data: { ...b.data, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    return reply.code(201).send(toCategoryDTO(c));
  });

  app.patch('/categories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = body.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'Dados inválidos' });
    const clash = await prisma.category.findFirst({ where: { name: { equals: b.data.name, mode: 'insensitive' }, id: { not: id } } });
    if (clash) return reply.code(400).send({ error: 'Já existe uma categoria com esse nome' });
    const c = await prisma.category.update({ where: { id }, data: b.data });
    return toCategoryDTO(c);
  });

  // Só categorias criadas pelo usuário: as padrão são usadas no mapeamento automático da Pluggy
  app.delete('/categories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const c = await prisma.category.findUnique({ where: { id } });
    if (!c) return reply.code(404).send({ error: 'Categoria não encontrada' });
    if (c.isDefault) return reply.code(400).send({ error: 'Categorias padrão não podem ser excluídas' });
    const used = await prisma.transaction.count({ where: { categoryId: id, deletedAt: null } });
    // Transações ficam sem categoria; orçamento e regras dela são removidos (onDelete no schema)
    await prisma.category.delete({ where: { id } });
    return { ok: true, uncategorized: used };
  });
}
