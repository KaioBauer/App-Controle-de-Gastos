import type { CategoryDTO, TransactionDTO } from '@financas/shared';
import type { Account, Category, Prisma, Transaction } from '@prisma/client';
import { prisma } from '../../lib/db';
import type { FlowTx } from '../../domain/spending';

type TxWithRelations = Transaction & { category: Category | null; account: Pick<Account, 'name' | 'type'> };

export const txInclude = { category: true, account: { select: { name: true, type: true } } } satisfies Prisma.TransactionInclude;

export function toCategoryDTO(c: Category): CategoryDTO {
  return { id: c.id, name: c.name, icon: c.icon, kind: c.kind, isDefault: c.isDefault };
}

export function toTransactionDTO(t: TxWithRelations): TransactionDTO {
  return {
    id: t.id,
    description: t.description,
    amountCents: Number(t.amountCents),
    localDate: t.localDate,
    date: t.date.toISOString(),
    category: t.category ? toCategoryDTO(t.category) : null,
    accountId: t.accountId,
    accountName: t.account.name,
    accountType: t.account.type,
    isTransfer: t.isTransfer,
    reviewed: t.reviewed,
    manual: t.pluggyId === null,
    notes: t.notes,
    tags: t.tags,
    status: t.status,
    installment: t.installmentNumber && t.totalInstallments ? { number: t.installmentNumber, total: t.totalInstallments } : null,
  };
}

/** Transações (não excluídas) num intervalo de datas locais, no formato usado pelas regras de domínio. */
export async function flowTxs(from: string, to: string): Promise<FlowTx[]> {
  const rows = await prisma.transaction.findMany({
    where: { deletedAt: null, localDate: { gte: from, lte: to } },
    select: { amountCents: true, localDate: true, categoryId: true, isTransfer: true, category: { select: { kind: true } } },
  });
  return rows.map((r) => ({
    amountCents: Number(r.amountCents),
    localDate: r.localDate,
    categoryId: r.categoryId,
    categoryKind: r.category?.kind ?? null,
    isTransfer: r.isTransfer,
  }));
}

/** Patrimônio disponível: saldo informado pela Pluggy + soma das transações das contas manuais. */
export async function balanceCents(): Promise<number> {
  const [synced, manual] = await Promise.all([
    prisma.account.aggregate({ where: { pluggyAccountId: { not: null }, type: { not: 'CREDIT' } }, _sum: { balanceCents: true } }),
    prisma.transaction.aggregate({
      where: { deletedAt: null, account: { pluggyAccountId: null } },
      _sum: { amountCents: true },
    }),
  ]);
  return Number(synced._sum.balanceCents ?? 0n) + Number(manual._sum.amountCents ?? 0n);
}

/** Transações sincronizadas ainda não revisadas (badge do ícone). */
export function unreviewedCount(): Promise<number> {
  return prisma.transaction.count({ where: { deletedAt: null, reviewed: false } });
}
