/**
 * Dinheiro é sempre representado em centavos inteiros.
 * Nunca multiplique floats por 100: a conversão é feita pela representação decimal.
 */

const DECIMAL_RE = /^([+-])?(\d*)(?:\.(\d*))?$/;

/** Converte um valor decimal (ex.: 12.34 vindo da Pluggy, ou "12,34") em centavos. Arredonda meio para longe do zero. */
export function toCents(value: number | string): number {
  let str = typeof value === 'number' ? String(value) : value.trim().replace(/\s/g, '');
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Valor inválido: ${value}`);
    // Notação exponencial (valores minúsculos ou enormes): converte para decimal fixo
    if (/e/i.test(str)) str = value.toFixed(6);
  } else if (str.includes(',')) {
    // Formato brasileiro: "1.234,56"
    str = str.replace(/\./g, '').replace(',', '.');
  }

  const m = DECIMAL_RE.exec(str);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) throw new Error(`Valor inválido: ${value}`);
  const negative = m[1] === '-';
  const intPart = m[2] || '0';
  const frac = (m[3] ?? '').padEnd(3, '0');

  let cents = Number(intPart) * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) throw new Error(`Valor fora do intervalo: ${value}`);
  return negative && cents !== 0 ? -cents : cents;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlSigned = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', signDisplay: 'exceptZero' });

/** Formata centavos como BRL. A divisão por 100 só acontece aqui, na exibição. */
export function formatBRL(cents: number, opts: { signed?: boolean } = {}): string {
  return (opts.signed ? brlSigned : brl).format(cents / 100);
}

const plain = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Valor absoluto sem o "R$" (ex.: "1.234,56"), para layouts que mostram o símbolo à parte. */
export function formatAmount(cents: number): string {
  return plain.format(Math.abs(cents) / 100);
}

export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
