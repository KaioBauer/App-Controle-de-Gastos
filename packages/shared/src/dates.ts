export const APP_TZ = 'America/Sao_Paulo';

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hm = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Data local (YYYY-MM-DD) no fuso de São Paulo. */
export function localDate(d: Date): string {
  return ymd.format(d);
}

/** Mês local (YYYY-MM) no fuso de São Paulo. */
export function localMonth(d: Date): string {
  return localDate(d).slice(0, 7);
}

/** Minutos desde a meia-noite no fuso de São Paulo. */
export function localMinutes(d: Date): number {
  const [h, m] = hm.format(d).split(':').map(Number);
  return h! * 60 + m!;
}

// Aritmética sobre datas "YYYY-MM-DD" (sem fuso: cada string já é um dia local)
const toUTC = (ymdStr: string) => {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
};
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

export function addDays(ymdStr: string, n: number): string {
  return fromUTC(toUTC(ymdStr) + n * DAY);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(a) - toUTC(b)) / DAY);
}

/** 0 = segunda ... 6 = domingo */
export function weekdayMon0(ymdStr: string): number {
  return (new Date(toUTC(ymdStr)).getUTCDay() + 6) % 7;
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

/** "2026-10" -> "2026-09" */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** "2026-01-31" + 1 mês -> "2026-02-28" (limita ao último dia do mês). */
export function addMonthsYmd(ymdStr: string, n: number): string {
  const ym = addMonths(ymdStr.slice(0, 7), n);
  const day = Math.min(Number(ymdStr.slice(8, 10)), daysInMonth(ym));
  return `${ym}-${String(day).padStart(2, '0')}`;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function monthName(ym: string): string {
  return MONTHS[Number(ym.slice(5, 7)) - 1]!;
}

/** "HH:MM" -> minutos */
export function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h! * 60 + m!;
}

/** Verifica se o horário atual está dentro da janela de silêncio (que pode atravessar a meia-noite). */
export function isInQuietHours(now: Date, start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  const n = localMinutes(now);
  if (s === e) return false;
  return s < e ? n >= s && n < e : n >= s || n < e;
}
