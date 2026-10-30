import { describe, expect, it } from 'vitest';
import { currentOccurrence, dueDateFor, findPayment, suggestBills, type BillDef } from './bills';
import type { CardTx } from './cards';

const rent: BillDef = { id: 'b', name: 'Aluguel', amountCents: 165000, dueDay: 5, dueDate: null, matchKey: 'imobiliaria x', createdOn: '2026-01-01' };

describe('dueDateFor', () => {
  it('dia 31 vira o último dia de meses curtos', () => {
    expect(dueDateFor({ dueDay: 31, dueDate: null }, '2026-02')).toBe('2026-02-28');
    expect(dueDateFor({ dueDay: 5, dueDate: null }, '2026-10')).toBe('2026-10-05');
  });
  it('conta única só vence no próprio mês', () => {
    expect(dueDateFor({ dueDay: null, dueDate: '2026-11-20' }, '2026-11')).toBe('2026-11-20');
    expect(dueDateFor({ dueDay: null, dueDate: '2026-11-20' }, '2026-10')).toBeNull();
  });
});

describe('currentOccurrence', () => {
  it('mês atual em aberto antes do vencimento: pendente', () => {
    expect(currentOccurrence({ ...rent, dueDay: 10 }, '2026-10-03', new Set(['2026-09']))).toEqual({ period: '2026-10', dueDate: '2026-10-10', status: 'pending' });
  });
  it('passou do dia sem pagar: vencida', () => {
    expect(currentOccurrence(rent, '2026-10-08', new Set(['2026-09']))!.status).toBe('overdue');
  });
  it('mês atual pago: mostra o próximo', () => {
    expect(currentOccurrence(rent, '2026-10-08', new Set(['2026-09', '2026-10']))).toEqual({ period: '2026-11', dueDate: '2026-11-05', status: 'pending' });
  });
  it('mês anterior em aberto aparece como vencido primeiro', () => {
    expect(currentOccurrence(rent, '2026-10-02', new Set())!.period).toBe('2026-09');
  });
  it('conta cadastrada agora não cobra meses anteriores', () => {
    const fresh = { ...rent, createdOn: '2026-10-20' };
    expect(currentOccurrence(fresh, '2026-10-20', new Set())).toEqual({ period: '2026-11', dueDate: '2026-11-05', status: 'pending' });
  });
  it('conta única paga fica como paga', () => {
    const once = { ...rent, dueDay: null, dueDate: '2026-10-15' };
    expect(currentOccurrence(once, '2026-10-20', new Set(['2026-10']))!.status).toBe('paid');
    expect(currentOccurrence(once, '2026-10-20', new Set())!.status).toBe('overdue');
  });
});

describe('findPayment (baixa automática)', () => {
  const txs = [
    { id: 'ok', description: 'Transferência enviada pelo Pix|IMOBILIARIA X', amountCents: -165000, localDate: '2026-10-04' },
    { id: 'longe', description: 'Transferência enviada pelo Pix|IMOBILIARIA X', amountCents: -165000, localDate: '2026-11-20' },
    { id: 'outro', description: 'Mercado', amountCents: -165000, localDate: '2026-10-05' },
  ];
  it('mesmo estabelecimento, valor parecido e perto do vencimento', () => {
    expect(findPayment(rent, '2026-10-05', txs)).toBe('ok');
  });
  it('valor muito diferente não conta', () => {
    expect(findPayment(rent, '2026-10-05', [{ ...txs[0]!, amountCents: -50000 }])).toBeNull();
  });
  it('conta sem valor fixo (ex.: luz) aceita qualquer valor do estabelecimento', () => {
    expect(findPayment({ ...rent, amountCents: null }, '2026-10-05', [{ ...txs[0]!, amountCents: -23456 }])).toBe('ok');
  });
});

describe('suggestBills', () => {
  const tx = (d: string, desc: string, cents: number): CardTx => ({
    id: d + desc, description: desc, amountCents: cents, localDate: d, categoryId: 'casa', categoryKind: 'EXPENSE',
    isTransfer: false, status: 'POSTED', billId: null, installmentNumber: null, totalInstallments: null,
  });
  const months = ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05'];
  const txs = months.map((d) => tx(d, 'Transferência enviada pelo Pix|IMOBILIARIA X', -165000));

  it('sugere pagamento mensal recorrente com dia e valor', () => {
    expect(suggestBills(txs, '2026-10-30', new Set())).toEqual([
      { matchKey: 'imobiliaria x', name: 'IMOBILIARIA X', amountCents: 165000, dueDay: 5, categoryId: 'casa' },
    ]);
  });
  it('não sugere o que já é conta ou foi dispensado', () => {
    expect(suggestBills(txs, '2026-10-30', new Set(['imobiliaria x']))).toEqual([]);
  });
});
