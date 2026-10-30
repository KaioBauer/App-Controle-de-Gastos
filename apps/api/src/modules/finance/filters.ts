import type { Prisma } from '@prisma/client';
import { z } from 'zod';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const txFilterQuery = z.object({
  q: z.string().trim().max(100).optional(),
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  /** "none" filtra as sem categoria */
  uncategorized: z.enum(['1']).optional(),
  from: z.string().regex(YMD).optional(),
  to: z.string().regex(YMD).optional(),
  type: z.enum(['expense', 'income', 'transfer']).optional(),
  unreviewed: z.enum(['1']).optional(),
});

export type TxFilter = z.infer<typeof txFilterQuery>;

const NOT_TRANSFER: Prisma.TransactionWhereInput = {
  isTransfer: false,
  OR: [{ categoryId: null }, { category: { kind: { not: 'TRANSFER' } } }],
};

/**
 * Monta o where do Prisma para a lista de transações.
 * Parcelas futuras (data depois de `today`) nunca entram na lista.
 */
export function buildTxWhere(f: TxFilter, today: string): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = [{ deletedAt: null }, { localDate: { lte: f.to && f.to < today ? f.to : today } }];

  if (f.from) and.push({ localDate: { gte: f.from } });
  if (f.accountId) and.push({ accountId: f.accountId });
  if (f.categoryId) and.push({ categoryId: f.categoryId });
  if (f.uncategorized) and.push({ categoryId: null });
  if (f.unreviewed) and.push({ reviewed: false });

  if (f.type === 'transfer') {
    and.push({ OR: [{ isTransfer: true }, { category: { kind: 'TRANSFER' } }] });
  } else if (f.type === 'expense') {
    and.push(NOT_TRANSFER, { amountCents: { lt: 0 } });
  } else if (f.type === 'income') {
    and.push(NOT_TRANSFER, { amountCents: { gt: 0 } });
  }

  if (f.q) {
    const contains = { contains: f.q, mode: 'insensitive' as const };
    and.push({ OR: [{ description: contains }, { merchant: contains }, { notes: contains }, { tags: { has: f.q.toLowerCase() } }] });
  }

  return { AND: and };
}
