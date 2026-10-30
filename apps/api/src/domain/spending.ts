import type { BudgetStatus, CategoryKind } from '@financas/shared';
import { daysInMonth } from '@financas/shared';

export interface FlowTx {
  amountCents: number;
  localDate: string;
  categoryId: string | null;
  categoryKind: CategoryKind | null;
  isTransfer: boolean;
}

/**
 * Quanto a transação conta como gasto (positivo) ou estorno (negativo).
 * Transferências entre contas próprias nunca contam. Sem categoria, o sinal decide.
 */
export function spendingOf(tx: FlowTx): number {
  if (tx.isTransfer || tx.categoryKind === 'TRANSFER' || tx.categoryKind === 'INCOME') return 0;
  if (tx.categoryKind === 'EXPENSE') return -tx.amountCents;
  return tx.amountCents < 0 ? -tx.amountCents : 0;
}

export function incomeOf(tx: FlowTx): number {
  if (tx.isTransfer || tx.categoryKind === 'TRANSFER' || tx.categoryKind === 'EXPENSE') return 0;
  if (tx.categoryKind === 'INCOME') return tx.amountCents;
  return tx.amountCents > 0 ? tx.amountCents : 0;
}

export function sumSpending(txs: Iterable<FlowTx>): number {
  let total = 0;
  for (const tx of txs) total += spendingOf(tx);
  return total;
}

export function spendingByCategory(txs: Iterable<FlowTx>): Map<string | null, number> {
  const out = new Map<string | null, number>();
  for (const tx of txs) {
    const v = spendingOf(tx);
    if (v !== 0) out.set(tx.categoryId, (out.get(tx.categoryId) ?? 0) + v);
  }
  return out;
}

export interface BudgetProgress {
  pct: number;
  status: BudgetStatus;
  projectedCents: number;
}

/** Progresso do orçamento mensal e projeção linear até o fim do mês. */
export function budgetProgress(limitCents: number, spentCents: number, today: string): BudgetProgress {
  const spent = Math.max(0, spentCents);
  const pct = limitCents > 0 ? (spent / limitCents) * 100 : 0;
  const day = Number(today.slice(8, 10));
  const projectedCents = Math.round((spent / day) * daysInMonth(today.slice(0, 7)));
  const status: BudgetStatus = spent > limitCents ? 'over' : pct >= 100 ? 'full' : pct >= 80 ? 'warn' : 'ok';
  return { pct, status, projectedCents };
}
