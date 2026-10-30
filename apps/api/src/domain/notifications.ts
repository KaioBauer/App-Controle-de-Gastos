import { diffDays, formatBRL, monthName } from '@financas/shared';

/**
 * Regras das notificações (puras). Cada aviso tem uma dedupeKey: a mesma situação
 * (ex.: "Mercado passou de 80% em outubro") gera no máximo uma notificação.
 */

export type NotificationType =
  | 'newTransaction'
  | 'budget'
  | 'billsDue'
  | 'lowBalance'
  | 'unusualSpending'
  | 'weeklySummary'
  | 'monthlySummary'
  | 'syncErrors';

export interface Notice {
  dedupeKey: string;
  type: NotificationType;
  title: string;
  body: string;
  url: string;
}

export interface TxInfo {
  id: string;
  description: string;
  amountCents: number;
  isTransfer: boolean;
  categoryId: string | null;
  categoryName: string | null;
}

/** Até este número de transações novas, uma notificação por transação; acima, um resumo. */
const MAX_INDIVIDUAL = 3;

const cleanName = (s: string) => s.split('|').pop()!.trim() || s;

export function newTransactionNotices(txs: TxInfo[], minCents: number): Notice[] {
  const relevant = txs.filter((t) => !t.isTransfer && Math.abs(t.amountCents) >= Math.max(1, minCents));
  if (relevant.length === 0) return [];
  if (relevant.length > MAX_INDIVIDUAL) {
    const spent = relevant.filter((t) => t.amountCents < 0).reduce((s, t) => s - t.amountCents, 0);
    return [
      {
        dedupeKey: `newtx:batch:${[...relevant].map((t) => t.id).sort()[0]}`,
        type: 'newTransaction',
        title: `${relevant.length} novas transações`,
        body: spent > 0 ? `${formatBRL(spent)} em gastos. Toque para revisar.` : 'Toque para revisar.',
        url: '/transacoes?unreviewed=1',
      },
    ];
  }
  return relevant.map((t) => ({
    dedupeKey: `newtx:${t.id}`,
    type: 'newTransaction',
    title: t.amountCents < 0 ? 'Nova compra' : 'Nova entrada',
    body: `${formatBRL(Math.abs(t.amountCents))} ${t.amountCents < 0 ? 'em' : 'de'} ${cleanName(t.description)}${t.categoryName ? ` · ${t.categoryName}` : ''}`,
    url: '/transacoes?unreviewed=1',
  }));
}

export interface BudgetInfo {
  categoryId: string;
  name: string;
  pct: number;
  spentCents: number;
  limitCents: number;
}

/** Avisa ao passar de 80% e de 100% do orçamento (uma vez por mês cada). */
export function budgetNotices(budgets: BudgetInfo[], month: string): Notice[] {
  const out: Notice[] = [];
  for (const b of budgets) {
    if (b.pct >= 100) {
      const over = b.spentCents - b.limitCents;
      out.push({
        dedupeKey: `budget:${b.categoryId}:${month}:100`,
        type: 'budget',
        title: `Orçamento de ${b.name} ${over > 0 ? 'estourado' : 'esgotado'}`,
        body: over > 0 ? `${formatBRL(over)} acima do limite de ${formatBRL(b.limitCents)} em ${monthName(month)}.` : `Você usou todo o limite de ${formatBRL(b.limitCents)}.`,
        url: '/orcamentos',
      });
    } else if (b.pct >= 80) {
      out.push({
        dedupeKey: `budget:${b.categoryId}:${month}:80`,
        type: 'budget',
        title: `${b.name}: ${Math.floor(b.pct)}% do orçamento`,
        body: `Restam ${formatBRL(b.limitCents - b.spentCents)} de ${formatBRL(b.limitCents)} para ${monthName(month)}.`,
        url: '/orcamentos',
      });
    }
  }
  return out;
}

export interface DueInfo {
  /** Identifica a conta (cartão ou conta a pagar) */
  key: string;
  name: string;
  amountCents: number | null;
  dueDate: string;
  url: string;
}

/** Contas e faturas: 3 dias antes e no dia do vencimento. */
export function dueNotices(items: DueInfo[], today: string): Notice[] {
  const out: Notice[] = [];
  for (const it of items) {
    const days = diffDays(it.dueDate, today);
    if (days !== 3 && days !== 0) continue;
    const value = it.amountCents ? `${formatBRL(it.amountCents)} · ` : '';
    out.push({
      dedupeKey: `due:${it.key}:${it.dueDate}:${days === 0 ? 'd0' : 'd3'}`,
      type: 'billsDue',
      title: days === 0 ? `${it.name} vence hoje` : `${it.name} vence em 3 dias`,
      body: `${value}vencimento ${it.dueDate.slice(8, 10)}/${it.dueDate.slice(5, 7)}`,
      url: it.url,
    });
  }
  return out;
}

/** Saldo abaixo do limite: no máximo um aviso por conta por dia. */
export function lowBalanceNotices(accounts: { id: string; name: string; balanceCents: number }[], thresholdCents: number, today: string): Notice[] {
  if (thresholdCents <= 0) return [];
  return accounts
    .filter((a) => a.balanceCents < thresholdCents)
    .map((a) => ({
      dedupeKey: `lowbal:${a.id}:${today}`,
      type: 'lowBalance' as const,
      title: `Saldo baixo em ${a.name}`,
      body: `Saldo de ${formatBRL(a.balanceCents)}, abaixo de ${formatBRL(thresholdCents)}.`,
      url: '/',
    }));
}

const UNUSUAL_FACTOR = 3;
const UNUSUAL_MIN_CENTS = 10_000;
const UNUSUAL_MIN_HISTORY = 5;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Gasto incomum: pelo menos 3× a mediana da categoria nos últimos meses, acima de R$ 100
 * e com histórico suficiente para a comparação fazer sentido.
 */
export function unusualNotices(txs: TxInfo[], historyByCategory: Map<string, number[]>): Notice[] {
  const out: Notice[] = [];
  for (const t of txs) {
    if (t.isTransfer || t.amountCents >= 0 || !t.categoryId) continue;
    const spent = -t.amountCents;
    const history = historyByCategory.get(t.categoryId) ?? [];
    if (spent < UNUSUAL_MIN_CENTS || history.length < UNUSUAL_MIN_HISTORY) continue;
    const typical = median(history);
    if (spent < typical * UNUSUAL_FACTOR) continue;
    out.push({
      dedupeKey: `unusual:${t.id}`,
      type: 'unusualSpending',
      title: `Gasto acima do normal em ${t.categoryName ?? 'uma categoria'}`,
      body: `${formatBRL(spent)} em ${cleanName(t.description)}. O normal nessa categoria é ${formatBRL(Math.round(typical))}.`,
      url: '/transacoes?unreviewed=1',
    });
  }
  return out;
}

export function weeklySummaryNotice(weekStart: string, spentCents: number, previousCents: number, top: { name: string; cents: number } | null): Notice {
  // Percentual só com base relevante e variação legível; senão, a diferença em reais
  const delta = previousCents > 0 ? Math.round(((spentCents - previousCents) / previousCents) * 100) : null;
  const diff = spentCents - previousCents;
  const readable = delta !== null && previousCents >= 10_000 && Math.abs(delta) <= 200;
  const amount = readable ? `${Math.abs(delta)}%` : formatBRL(Math.abs(diff));
  const trend =
    previousCents <= 0 ? '' : diff > 0 ? ` (${amount} a mais que a semana anterior)` : diff < 0 ? ` (${amount} a menos que a semana anterior)` : ' (igual à semana anterior)';
  return {
    dedupeKey: `weekly:${weekStart}`,
    type: 'weeklySummary',
    title: 'Resumo da semana',
    body: `Você gastou ${formatBRL(spentCents)}${trend}.${top ? ` Maior categoria: ${top.name}, ${formatBRL(top.cents)}.` : ''}`,
    url: '/analise',
  };
}

export function monthlySummaryNotice(month: string, spentCents: number, incomeCents: number, budgetsOver: number): Notice {
  const balance = incomeCents - spentCents;
  return {
    dedupeKey: `monthly:${month}`,
    type: 'monthlySummary',
    title: `Fechamento de ${monthName(month)}`,
    body: `Gastos ${formatBRL(spentCents)}, entradas ${formatBRL(incomeCents)} (${balance >= 0 ? 'sobrou' : 'faltou'} ${formatBRL(Math.abs(balance))}).${budgetsOver ? ` ${budgetsOver} ${budgetsOver === 1 ? 'orçamento estourou' : 'orçamentos estouraram'}.` : ''}`,
    url: '/analise',
  };
}

export interface ConnectionInfo {
  itemId: string;
  name: string;
  error: string | null;
  consentExpiresAt: string | null;
}

/** Erro de sincronização (uma vez por dia) e consentimento expirando (7 dias e 1 dia antes). */
export function connectionNotices(items: ConnectionInfo[], today: string): Notice[] {
  const out: Notice[] = [];
  for (const it of items) {
    if (it.error) {
      out.push({
        dedupeKey: `sync:${it.itemId}:${today}`,
        type: 'syncErrors',
        title: `Problema na conexão ${it.name}`,
        body: `${it.error} Confira em Ajustes › Conexões.`,
        url: '/ajustes/conexoes',
      });
    }
    if (it.consentExpiresAt) {
      const days = diffDays(it.consentExpiresAt, today);
      const stage = days <= 1 ? 'last' : days <= 7 ? 'week' : null;
      if (stage && days >= 0) {
        out.push({
          dedupeKey: `consent:${it.itemId}:${it.consentExpiresAt}:${stage}`,
          type: 'syncErrors',
          title: `Renove o acesso de ${it.name}`,
          body: days === 0 ? 'O consentimento expira hoje. Renove em meu.pluggy.ai.' : `O consentimento expira em ${days} ${days === 1 ? 'dia' : 'dias'}. Renove em meu.pluggy.ai.`,
          url: '/ajustes/conexoes',
        });
      }
    }
  }
  return out;
}

export type NotificationToggles = Record<NotificationType, boolean>;

export function enabledOnly(notices: Notice[], toggles: NotificationToggles): Notice[] {
  return notices.filter((n) => toggles[n.type]);
}
