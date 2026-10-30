import { describe, expect, it } from 'vitest';
import { balanceHistory, compareMonths, monthlyCashflow, monthsBack, toCsv } from './reports';
import type { FlowTx } from './spending';

const tx = (localDate: string, amountCents: number, p: Partial<FlowTx> = {}): FlowTx => ({
  localDate,
  amountCents,
  categoryId: 'food',
  categoryKind: amountCents < 0 ? 'EXPENSE' : 'INCOME',
  isTransfer: false,
  ...p,
});

describe('monthsBack', () => {
  it('conta para trás atravessando o ano', () => {
    expect(monthsBack('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('monthlyCashflow', () => {
  it('entradas e saídas por mês, sem transferências', () => {
    const r = monthlyCashflow(
      [tx('2026-09-05', 650000), tx('2026-09-10', -20000), tx('2026-10-02', -5000), tx('2026-10-03', -100000, { isTransfer: true, categoryKind: 'TRANSFER' })],
      ['2026-09', '2026-10'],
    );
    expect(r).toEqual([
      { month: '2026-09', incomeCents: 650000, expenseCents: 20000 },
      { month: '2026-10', incomeCents: 0, expenseCents: 5000 },
    ]);
  });
});

describe('balanceHistory', () => {
  it('reconstrói o saldo de fim de mês a partir do saldo atual', () => {
    // Hoje (30/10) o saldo é 1.000. Em outubro entrou 500 e saiu 200 -> fim de setembro = 700
    const txs = [
      { amountCents: 50000, localDate: '2026-10-05' },
      { amountCents: -20000, localDate: '2026-10-20' },
      { amountCents: -10000, localDate: '2026-09-15' },
    ];
    expect(balanceHistory(100000, txs, ['2026-08', '2026-09', '2026-10'], '2026-10-30')).toEqual([
      { month: '2026-08', balanceCents: 80000 },
      { month: '2026-09', balanceCents: 70000 },
      { month: '2026-10', balanceCents: 100000 },
    ]);
  });
});

describe('compareMonths', () => {
  it('categorias dos dois meses, maior diferença primeiro', () => {
    const cats = new Map([
      ['food', { id: 'food', name: 'Alimentação', icon: 'food' }],
      ['bus', { id: 'bus', name: 'Transporte', icon: 'bus' }],
    ]);
    const r = compareMonths([tx('2026-09-01', -10000), tx('2026-09-02', -5000, { categoryId: 'bus' })], [tx('2026-10-01', -40000)], cats);
    expect(r.map((x) => [x.name, x.aCents, x.bCents, x.deltaCents])).toEqual([
      ['Alimentação', 10000, 40000, 30000],
      ['Transporte', 5000, 0, -5000],
    ]);
  });
});

describe('toCsv', () => {
  it('formato do Excel em português: ; e vírgula decimal, aspas quando preciso', () => {
    const csv = toCsv([
      { localDate: '2026-10-30', description: 'Compra; com "aspas"', category: 'Mercado', account: 'Nubank', amountCents: -4673, notes: '', tags: ['casa', 'mercado'] },
      { localDate: '2026-10-29', description: 'Salário', category: 'Salário', account: 'Nubank', amountCents: 650000, notes: 'outubro', tags: [] },
    ]);
    expect(csv.startsWith('﻿Data;Descrição;Categoria;Conta;Valor;Notas;Tags\r\n')).toBe(true);
    expect(csv).toContain('30/10/2026;"Compra; com ""aspas""";Mercado;Nubank;-46,73;;casa, mercado\r\n');
    expect(csv).toContain('29/10/2026;Salário;Salário;Nubank;6500,00;outubro;\r\n');
  });
});
