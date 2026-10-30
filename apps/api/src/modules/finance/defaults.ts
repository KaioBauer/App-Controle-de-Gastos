import type { CategoryKind } from '@prisma/client';
import { merchantKey } from '../../domain/merchant';
import { prisma } from '../../lib/db';

const DEFAULT_CATEGORIES: { name: string; icon: string; kind: CategoryKind }[] = [
  { name: 'Alimentação', icon: 'food', kind: 'EXPENSE' },
  { name: 'Mercado', icon: 'cart', kind: 'EXPENSE' },
  { name: 'Transporte', icon: 'bus', kind: 'EXPENSE' },
  { name: 'Casa', icon: 'home', kind: 'EXPENSE' },
  { name: 'Assinaturas', icon: 'subs', kind: 'EXPENSE' },
  { name: 'Lazer', icon: 'fun', kind: 'EXPENSE' },
  { name: 'Saúde', icon: 'health', kind: 'EXPENSE' },
  { name: 'Compras', icon: 'shopping', kind: 'EXPENSE' },
  { name: 'Educação', icon: 'education', kind: 'EXPENSE' },
  { name: 'Outros', icon: 'other', kind: 'EXPENSE' },
  { name: 'Salário', icon: 'income', kind: 'INCOME' },
  { name: 'Outras entradas', icon: 'income', kind: 'INCOME' },
  { name: 'Transferências', icon: 'transfer', kind: 'TRANSFER' },
];

export const CASH_ACCOUNT_NAME = 'Dinheiro';

/** Cria categorias padrão e a conta de dinheiro em espécie (idempotente, roda no start). */
export async function ensureDefaults() {
  await prisma.$transaction(
    DEFAULT_CATEGORIES.map((c, i) =>
      prisma.category.upsert({
        where: { name: c.name },
        create: { ...c, isDefault: true, sortOrder: i },
        update: {},
      }),
    ),
  );
  const cash = await prisma.account.findFirst({ where: { type: 'CASH' } });
  if (!cash) await prisma.account.create({ data: { name: CASH_ACCOUNT_NAME, type: 'CASH' } });
  await backfillMerchantKeys();
}

/** Preenche merchantKey de transações antigas (criadas antes do campo existir). */
async function backfillMerchantKeys() {
  for (;;) {
    const rows = await prisma.transaction.findMany({
      where: { merchantKey: null },
      select: { id: true, description: true },
      take: 500,
    });
    if (rows.length === 0) return;
    await prisma.$transaction(
      // String vazia marca "sem chave" para não reprocessar
      rows.map((r) => prisma.transaction.update({ where: { id: r.id }, data: { merchantKey: merchantKey(r.description) } })),
    );
  }
}
