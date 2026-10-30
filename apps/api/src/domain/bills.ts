import { addMonths, daysInMonth, diffDays } from '@financas/shared';
import { detectRecurring, type CardTx } from './cards';
import { merchantKey } from './merchant';

export interface BillDef {
  id: string;
  name: string;
  amountCents: number | null;
  dueDay: number | null;
  dueDate: string | null;
  matchKey: string | null;
  /** YYYY-MM-DD em que a conta foi cadastrada: meses anteriores não contam como vencidos */
  createdOn: string;
}

export type BillStatus = 'pending' | 'overdue' | 'paid';

export interface BillOccurrence {
  period: string;
  dueDate: string;
  status: BillStatus;
}

/** Vencimento da conta num mês ("YYYY-MM"); dia 31 vira o último dia em meses curtos. */
export function dueDateFor(bill: Pick<BillDef, 'dueDay' | 'dueDate'>, period: string): string | null {
  if (bill.dueDay) {
    const day = Math.min(bill.dueDay, daysInMonth(period));
    return `${period}-${String(day).padStart(2, '0')}`;
  }
  return bill.dueDate && bill.dueDate.startsWith(period) ? bill.dueDate : null;
}

/**
 * Ocorrência que importa agora: a vencida mais antiga ainda não paga, senão a do mês atual,
 * senão (mês atual já pago) a do mês seguinte.
 */
export function currentOccurrence(bill: BillDef, today: string, paid: Set<string>): BillOccurrence | null {
  if (!bill.dueDay) {
    if (!bill.dueDate) return null;
    const period = bill.dueDate.slice(0, 7);
    if (paid.has(period)) return { period, dueDate: bill.dueDate, status: 'paid' };
    return { period, dueDate: bill.dueDate, status: bill.dueDate < today ? 'overdue' : 'pending' };
  }

  const thisMonth = today.slice(0, 7);
  const prev = addMonths(thisMonth, -1);
  const prevDue = dueDateFor(bill, prev)!;
  // Mês anterior em aberto (e já existia a conta nele) = vencida
  if (prevDue >= bill.createdOn && !paid.has(prev)) return { period: prev, dueDate: prevDue, status: 'overdue' };

  const due = dueDateFor(bill, thisMonth)!;
  if (!paid.has(thisMonth)) {
    if (due < bill.createdOn) {
      const next = addMonths(thisMonth, 1);
      return { period: next, dueDate: dueDateFor(bill, next)!, status: 'pending' };
    }
    return { period: thisMonth, dueDate: due, status: due < today ? 'overdue' : 'pending' };
  }
  const next = addMonths(thisMonth, 1);
  return { period: next, dueDate: dueDateFor(bill, next)!, status: 'pending' };
}

export interface PaymentCandidate {
  id: string;
  description: string;
  amountCents: number;
  localDate: string;
}

/** Janela em torno do vencimento em que um pagamento conta para aquela ocorrência */
const MATCH_WINDOW_DAYS = 12;
const AMOUNT_TOLERANCE = 0.25;

/** Transação do extrato que paga esta ocorrência (mesmo estabelecimento, valor parecido, perto do vencimento). */
export function findPayment(bill: BillDef, dueDate: string, txs: PaymentCandidate[]): string | null {
  if (!bill.matchKey) return null;
  const hit = txs
    .filter((t) => t.amountCents < 0 && merchantKey(t.description) === bill.matchKey)
    .filter((t) => Math.abs(diffDays(t.localDate, dueDate)) <= MATCH_WINDOW_DAYS)
    .filter((t) => !bill.amountCents || Math.abs(-t.amountCents - bill.amountCents) <= bill.amountCents * AMOUNT_TOLERANCE)
    .sort((a, b) => Math.abs(diffDays(a.localDate, dueDate)) - Math.abs(diffDays(b.localDate, dueDate)))[0];
  return hit?.id ?? null;
}

export interface BillSuggestion {
  matchKey: string;
  name: string;
  amountCents: number;
  dueDay: number;
  categoryId: string | null;
}

/**
 * Pagamentos que se repetem todo mês fora do cartão (débito, PIX, boleto) e ainda não viraram conta.
 * Reaproveita a detecção de recorrentes do cartão.
 */
export function suggestBills(txs: CardTx[], today: string, known: Set<string>): BillSuggestion[] {
  return detectRecurring(txs, today)
    .filter((r) => !known.has(r.key))
    .map((r) => ({
      matchKey: r.key,
      name: r.name.split('|').pop()!.trim() || r.name,
      amountCents: r.amountCents,
      dueDay: Number(r.lastDate.slice(8, 10)),
      categoryId: r.categoryId,
    }));
}
