import { addMonths, daysInMonth } from '@financas/shared';
import { incomeOf, spendingByCategory, spendingOf, type FlowTx } from './spending';

/** Últimos `n` meses terminando em `lastMonth` (inclusive), do mais antigo ao mais recente. */
export function monthsBack(lastMonth: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(lastMonth, i - n + 1));
}

export const monthEnd = (ym: string) => `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`;

/** Entradas e saídas por mês (transferências entre contas próprias não contam). */
export function monthlyCashflow(txs: FlowTx[], months: string[]) {
  const rows = new Map(months.map((m) => [m, { month: m, incomeCents: 0, expenseCents: 0 }]));
  for (const t of txs) {
    const row = rows.get(t.localDate.slice(0, 7));
    if (!row) continue;
    row.incomeCents += incomeOf(t);
    row.expenseCents += spendingOf(t);
  }
  return [...rows.values()];
}

/**
 * Saldo em conta ao fim de cada mês, reconstruído a partir do saldo atual:
 * saldo(fim do mês) = saldo de hoje − tudo que entrou/saiu depois daquele dia.
 * `accountTxs` são só as movimentações das contas que compõem o saldo (conta e dinheiro).
 */
export function balanceHistory(currentCents: number, accountTxs: { amountCents: number; localDate: string }[], months: string[], today: string) {
  return months.map((m) => {
    const end = monthEnd(m) < today ? monthEnd(m) : today;
    const after = accountTxs.filter((t) => t.localDate > end && t.localDate <= today).reduce((s, t) => s + t.amountCents, 0);
    return { month: m, balanceCents: currentCents - after };
  });
}

export interface CategoryName {
  id: string;
  name: string;
  icon: string;
}

/** Gasto por categoria em dois meses, ordenado pela maior diferença. */
export function compareMonths(a: FlowTx[], b: FlowTx[], categories: Map<string, CategoryName>) {
  const ca = spendingByCategory(a);
  const cb = spendingByCategory(b);
  const ids = new Set([...ca.keys(), ...cb.keys()]);
  return [...ids]
    .map((id) => {
      const info = id ? categories.get(id) : undefined;
      const aCents = Math.max(0, ca.get(id) ?? 0);
      const bCents = Math.max(0, cb.get(id) ?? 0);
      return { id: id ?? 'none', name: info?.name ?? 'Sem categoria', icon: info?.icon ?? 'other', aCents, bCents, deltaCents: bCents - aCents };
    })
    .filter((r) => r.aCents > 0 || r.bCents > 0)
    .sort((x, y) => Math.abs(y.deltaCents) - Math.abs(x.deltaCents));
}

export interface CsvRow {
  localDate: string;
  description: string;
  category: string;
  account: string;
  amountCents: number;
  notes: string;
  tags: string[];
}

const BRL_DECIMAL = (cents: number) => {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
};

/** Campo CSV: aspas quando há separador, aspas ou quebra de linha. */
function field(v: string) {
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * CSV para Excel/Google Planilhas em português: separador ";", vírgula decimal,
 * data dd/mm/aaaa e BOM UTF-8 (para os acentos abrirem certos no Excel).
 */
export function toCsv(rows: CsvRow[]): string {
  const header = ['Data', 'Descrição', 'Categoria', 'Conta', 'Valor', 'Notas', 'Tags'];
  const lines = rows.map((r) =>
    [
      `${r.localDate.slice(8, 10)}/${r.localDate.slice(5, 7)}/${r.localDate.slice(0, 4)}`,
      r.description,
      r.category,
      r.account,
      BRL_DECIMAL(r.amountCents),
      r.notes,
      r.tags.join(', '),
    ]
      .map(field)
      .join(';'),
  );
  return `﻿${[header.join(';'), ...lines].join('\r\n')}\r\n`;
}
