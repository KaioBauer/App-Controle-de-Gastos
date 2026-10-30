import type { AnalysisDTO, Period } from '@financas/shared';
import { addDays, addMonths, daysInMonth, diffDays, formatBRL, monthName, weekdayMon0 } from '@financas/shared';
import { spendingByCategory, sumSpending, type FlowTx } from './spending';

export interface PeriodRange {
  start: string;
  end: string;
  /** Início do período anterior */
  prevStart: string;
  /** Mesmo trecho do período anterior até "hoje", para comparação justa */
  prevToDateEnd: string;
  name: string;
  previousName: string;
  labels: string[];
  names: string[];
  bucketOf: (ymd: string) => number;
}

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function periodRange(period: Period, today: string): PeriodRange {
  if (period === 'week') {
    const start = addDays(today, -weekdayMon0(today));
    const prevStart = addDays(start, -7);
    return {
      start,
      end: addDays(start, 6),
      prevStart,
      prevToDateEnd: addDays(prevStart, diffDays(today, start)),
      name: 'esta semana',
      previousName: 'semana anterior',
      labels: ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'],
      names: ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'],
      bucketOf: (d) => diffDays(d, start),
    };
  }

  if (period === 'month') {
    const ym = today.slice(0, 7);
    const prevYm = addMonths(ym, -1);
    const day = Math.min(Number(today.slice(8, 10)), daysInMonth(prevYm));
    return {
      start: `${ym}-01`,
      end: `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`,
      prevStart: `${prevYm}-01`,
      prevToDateEnd: `${prevYm}-${String(day).padStart(2, '0')}`,
      name: monthName(ym),
      previousName: monthName(prevYm),
      labels: ['S1', 'S2', 'S3', 'S4', 'S5'],
      names: ['semana 1', 'semana 2', 'semana 3', 'semana 4', 'semana 5'],
      // Dias 29–31 entram na semana 5
      bucketOf: (d) => Math.min(4, Math.floor((Number(d.slice(8, 10)) - 1) / 7)),
    };
  }

  const year = Number(today.slice(0, 4));
  const monthDay = today.slice(5);
  // 29/02 em ano não bissexto vira 28/02
  const prevToDate = monthDay === '02-29' ? `${year - 1}-02-28` : `${year - 1}-${monthDay}`;
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    prevStart: `${year - 1}-01-01`,
    prevToDateEnd: prevToDate,
    name: String(year),
    previousName: String(year - 1),
    labels: MONTH_LABELS,
    names: MONTH_SHORT,
    bucketOf: (d) => Number(d.slice(5, 7)) - 1,
  };
}

/** Dias que cada barra cobre, para abrir as transações dela. */
export function bucketRange(period: Period, start: string, i: number): { from: string; to: string } {
  if (period === 'week') {
    const day = addDays(start, i);
    return { from: day, to: day };
  }
  if (period === 'month') {
    const ym = start.slice(0, 7);
    const last = i === 4 ? daysInMonth(ym) : Math.min(7 * i + 7, daysInMonth(ym));
    const pad = (n: number) => String(n).padStart(2, '0');
    return { from: `${ym}-${pad(7 * i + 1)}`, to: `${ym}-${pad(last)}` };
  }
  const ym = addMonths(start.slice(0, 7), i);
  return { from: `${ym}-01`, to: `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}` };
}

export interface CategoryInfo {
  id: string;
  name: string;
  icon: string;
}

/** Variação percentual arredondada; null quando não há base. */
function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

const MIN_INSIGHT_CENTS = 5_000;

export interface BudgetInfo {
  totalCents: number;
  /** Só as categorias orçadas entram na projeção contra o limite */
  categoryIds: Set<string>;
}

/**
 * Monta a tela de Análise. `txs` deve cobrir de `range.prevStart` até `range.end`.
 * `budget` permite a projeção de sobra no fim do mês.
 */
export function buildAnalysis(
  period: Period,
  today: string,
  txs: FlowTx[],
  categories: Map<string, CategoryInfo>,
  budget: BudgetInfo = { totalCents: 0, categoryIds: new Set() },
): AnalysisDTO {
  const r = periodRange(period, today);
  const current = txs.filter((t) => t.localDate >= r.start && t.localDate <= r.end);
  const previousToDate = txs.filter((t) => t.localDate >= r.prevStart && t.localDate <= r.prevToDateEnd);
  const currentToDate = current.filter((t) => t.localDate <= today);

  const totalCents = sumSpending(current);
  const bars = r.labels.map((label, i) => ({ label, name: r.names[i]!, cents: 0, ...bucketRange(period, r.start, i) }));
  for (const tx of current) {
    const bar = bars[r.bucketOf(tx.localDate)];
    if (bar) bar.cents += sumSpending([tx]);
  }

  const byCat = spendingByCategory(current);
  const cats = [...byCat.entries()]
    .filter(([, cents]) => cents > 0)
    .map(([id, cents]) => {
      const info = id ? categories.get(id) : undefined;
      return { id: id ?? 'none', name: info?.name ?? 'Sem categoria', icon: info?.icon ?? 'other', cents };
    })
    .sort((a, b) => b.cents - a.cents);

  return {
    period,
    name: r.name,
    start: r.start,
    end: r.end,
    totalCents,
    deltaPct: pctChange(sumSpending(currentToDate), sumSpending(previousToDate)),
    previousName: r.previousName,
    bars,
    categories: cats,
    insight: buildInsight(period, today, currentToDate, previousToDate, categories, r.previousName, budget),
  };
}

function buildInsight(
  period: Period,
  today: string,
  current: FlowTx[],
  previous: FlowTx[],
  categories: Map<string, CategoryInfo>,
  previousName: string,
  budget: BudgetInfo,
): AnalysisDTO['insight'] {
  const now = spendingByCategory(current);
  const before = spendingByCategory(previous);

  let best: { name: string; change: number } | null = null;
  for (const [id, prev] of before) {
    const cur = now.get(id) ?? 0;
    if (!id || Math.max(cur, prev) < MIN_INSIGHT_CENTS) continue;
    const change = pctChange(cur, prev);
    if (change === null || change === 0) continue;
    if (!best || Math.abs(change) > Math.abs(best.change)) best = { name: categories.get(id)?.name ?? 'Categoria', change };
  }

  let projection = '';
  if (period === 'month' && budget.totalCents > 0) {
    const day = Number(today.slice(8, 10));
    const budgeted = current.filter((t) => t.categoryId && budget.categoryIds.has(t.categoryId));
    const projected = Math.round((sumSpending(budgeted) / day) * daysInMonth(today.slice(0, 7)));
    const left = budget.totalCents - projected;
    projection =
      left >= 0
        ? ` No ritmo atual, você fecha o mês com ${formatBRL(left)} sobrando.`
        : ` No ritmo atual, você passa do orçamento em ${formatBRL(-left)}.`;
  }

  if (!best) return projection ? { title: 'Projeção do mês', body: projection.trim() } : null;
  const verb = best.change < 0 ? 'caiu' : 'subiu';
  return {
    title: `${best.name} ${verb} ${Math.abs(best.change)}%`,
    body: `Comparado ${period === 'week' ? 'à' : 'a'} ${previousName}.${projection}`,
  };
}
