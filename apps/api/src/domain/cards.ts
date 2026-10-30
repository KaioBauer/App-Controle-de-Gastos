import { addMonthsYmd, diffDays } from '@financas/shared';
import { merchantKey } from './merchant';
import { spendingOf, type FlowTx } from './spending';

export { merchantKey };

/** Transação de cartão com o necessário para faturas, recorrentes e parcelas. */
export interface CardTx extends FlowTx {
  id: string;
  description: string;
  status: string | null;
  billId: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  /** Data da compra original (parcelamentos) */
  purchaseDate?: string | null;
}

// ---------------------------------------------------------------------------
// Ciclo da fatura
// ---------------------------------------------------------------------------

export interface BillCycle {
  /** Fechamento da última fatura fechada (estimado pela última compra dela) */
  lastClose: string | null;
  /** Fechamento e vencimento estimados da fatura aberta */
  nextClose: string;
  nextDue: string | null;
}

/**
 * A Pluggy não informa a data de fechamento do Nubank, então ela é inferida:
 * a última fatura fechada termina na data da última transação ligada a ela,
 * e a fatura aberta fecha um mês depois. O vencimento segue o da última fatura + 1 mês.
 */
export function billCycle(lastBill: { dueDate: string; lastTxDate: string | null } | null, today: string): BillCycle {
  if (!lastBill?.lastTxDate) {
    return { lastClose: null, nextClose: addMonthsYmd(today, 1), nextDue: lastBill ? addMonthsYmd(lastBill.dueDate, 1) : null };
  }
  let lastClose = lastBill.lastTxDate;
  let nextDue = addMonthsYmd(lastBill.dueDate, 1);
  // Se a fatura "aberta" estimada já fechou (sync atrasado), avança os ciclos
  while (addMonthsYmd(lastClose, 1) < today) {
    lastClose = addMonthsYmd(lastClose, 1);
    nextDue = addMonthsYmd(nextDue, 1);
  }
  return { lastClose, nextClose: addMonthsYmd(lastClose, 1), nextDue };
}

/** Compras da fatura aberta: ainda pendentes e até o próximo fechamento. */
export function openBillTxs(txs: CardTx[], cycle: BillCycle): CardTx[] {
  return txs.filter((t) => t.status === 'PENDING' && t.localDate <= cycle.nextClose && !t.billId);
}

/** Total gasto numa lista (pagamentos da fatura são transferência e não entram; estornos abatem). */
export function billTotal(txs: CardTx[]): number {
  return txs.reduce((s, t) => s + spendingOf(t), 0);
}

/** Parcelas já lançadas para as próximas faturas, agrupadas por ciclo. */
export function futureBills(txs: CardTx[], cycle: BillCycle, months = 6): { close: string; totalCents: number }[] {
  const out = Array.from({ length: months }, (_, i) => ({ close: addMonthsYmd(cycle.nextClose, i + 1), totalCents: 0 }));
  for (const t of txs) {
    if (t.localDate <= cycle.nextClose || t.billId) continue;
    const bucket = out.find((b) => t.localDate <= b.close);
    if (bucket) bucket.totalCents += spendingOf(t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Despesas fixas (recorrentes)
// ---------------------------------------------------------------------------

export interface Recurring {
  key: string;
  name: string;
  categoryId: string | null;
  amountCents: number;
  lastDate: string;
  nextDate: string;
  months: number;
}

/** Impostos e encargos se repetem mas não são "despesa fixa" */
const NOT_RECURRING = /^(iof|juros|multa|encargos|anuidade)\b/i;

const RECURRING_MIN_MONTHS = 3;
const RECURRING_LOOKBACK_DAYS = 200;
/** Ainda ativa se apareceu nos últimos ~45 dias */
const RECURRING_ACTIVE_DAYS = 45;
const AMOUNT_TOLERANCE = 0.2;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

/**
 * Detecta cobranças mensais: mesmo estabelecimento em pelo menos 3 meses diferentes,
 * intervalo típico de ~1 mês e valor estável (±20%). Parceladas e transferências ficam de fora.
 */
export function detectRecurring(txs: CardTx[], today: string): Recurring[] {
  const groups = new Map<string, CardTx[]>();
  for (const t of txs) {
    if (spendingOf(t) <= 0 || (t.totalInstallments ?? 0) > 1 || NOT_RECURRING.test(t.description)) continue;
    if (diffDays(today, t.localDate) > RECURRING_LOOKBACK_DAYS || t.localDate > today) continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    // Uma cobrança por mês: fica a mais recente de cada mês
    const byMonth = new Map<string, CardTx>();
    for (const t of list) {
      const m = t.localDate.slice(0, 7);
      const cur = byMonth.get(m);
      if (!cur || t.localDate > cur.localDate) byMonth.set(m, t);
    }
    const monthly = [...byMonth.values()].sort((a, b) => a.localDate.localeCompare(b.localDate));
    if (monthly.length < RECURRING_MIN_MONTHS) continue;
    // Muitas compras no mesmo lugar (padaria, posto) não são assinatura
    if (list.length > monthly.length * 1.5) continue;

    const last = monthly.at(-1)!;
    if (diffDays(today, last.localDate) > RECURRING_ACTIVE_DAYS) continue;

    const amounts = monthly.map((t) => spendingOf(t));
    const med = median(amounts);
    if (amounts.some((a) => Math.abs(a - med) > med * AMOUNT_TOLERANCE)) continue;

    const gaps = monthly.slice(1).map((t, i) => diffDays(t.localDate, monthly[i]!.localDate));
    const gap = median(gaps);
    if (gap < 25 || gap > 35) continue;

    out.push({
      key,
      name: last.description,
      categoryId: last.categoryId,
      amountCents: spendingOf(last),
      lastDate: last.localDate,
      nextDate: addMonthsYmd(last.localDate, 1),
      months: monthly.length,
    });
  }
  return out.sort((a, b) => b.amountCents - a.amountCents);
}

// ---------------------------------------------------------------------------
// Parcelamentos
// ---------------------------------------------------------------------------

export interface Installment {
  key: string;
  name: string;
  categoryId: string | null;
  installmentCents: number;
  /** Parcela da fatura atual (ou a última já lançada) */
  current: number;
  total: number;
  /** Soma das parcelas que ainda vão cair depois da fatura aberta */
  remainingCents: number;
  lastDate: string;
}

/** Quantos fechamentos mensais cabem entre `from` e `until`. */
function monthsUntil(from: string, until: string): number {
  let k = 0;
  while (addMonthsYmd(from, k + 1) <= until) k++;
  return k;
}

/**
 * Agrupa compras parceladas e calcula quanto ainda falta pagar.
 * Cada compra é identificada pelo mês da 1ª parcela (data da parcela − (n−1) meses).
 * Não usamos `purchaseDate` da Pluggy: em dados reais ela varia entre parcelas da mesma compra.
 * As parcelas podem diferir em 1 centavo, então o valor também não entra na chave.
 */
export function groupInstallments(txs: CardTx[], cycle: BillCycle): Installment[] {
  const groups = new Map<string, CardTx[]>();
  for (const t of txs) {
    if (!t.totalInstallments || t.totalInstallments < 2 || !t.installmentNumber) continue;
    const per = spendingOf(t);
    if (per <= 0) continue;
    const startMonth = addMonthsYmd(t.localDate, -(t.installmentNumber - 1)).slice(0, 7);
    const key = `${merchantKey(t.description)}|${t.totalInstallments}|${startMonth}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const out: Installment[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.installmentNumber! - b.installmentNumber!);
    const total = sorted[0]!.totalInstallments!;
    const latest = sorted.at(-1)!;
    const per = spendingOf(latest);
    // A parcela da fatura aberta é a última vista avançada pelos meses até o fechamento,
    // porque o histórico nem sempre traz todas as parcelas
    const seenUpToNow = sorted.filter((t) => t.localDate <= cycle.nextClose).at(-1);
    const current = seenUpToNow
      ? Math.min(total, seenUpToNow.installmentNumber! + monthsUntil(seenUpToNow.localDate, cycle.nextClose))
      : sorted[0]!.installmentNumber! - 1;
    const remaining = total - current;
    if (remaining <= 0) continue;
    out.push({
      key,
      name: latest.description.replace(/\s*\d+\s*\/\s*\d+\s*$/, ''),
      categoryId: latest.categoryId,
      installmentCents: per,
      current,
      total,
      remainingCents: remaining * per,
      lastDate: addMonthsYmd(latest.localDate, total - latest.installmentNumber!),
    });
  }
  return out.sort((a, b) => b.remainingCents - a.remainingCents);
}
