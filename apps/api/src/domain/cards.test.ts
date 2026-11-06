import { describe, expect, it } from 'vitest';
import { billCycle, billTotal, detectRecurring, futureBills, groupInstallments, merchantKey, openBillTxs, type CardTx } from './cards';

let seq = 0;
const tx = (p: Partial<CardTx> & Pick<CardTx, 'localDate' | 'amountCents' | 'description'>): CardTx => ({
  id: `t${seq++}`,
  categoryId: 'cat',
  categoryKind: 'EXPENSE',
  isTransfer: false,
  status: 'POSTED',
  billId: null,
  installmentNumber: null,
  totalInstallments: null,
  ...p,
});

describe('billCycle', () => {
  it('infere fechamento pela última compra da fatura fechada (Nubank: fecha dia 4, vence dia 13)', () => {
    const c = billCycle({ dueDate: '2026-10-13', lastTxDate: '2026-10-04' }, '2026-10-30');
    expect(c).toEqual({ lastClose: '2026-10-04', nextClose: '2026-11-04', nextDue: '2026-11-13', openAfter: null });
  });

  it('avança o ciclo se o sync estiver atrasado', () => {
    const c = billCycle({ dueDate: '2026-09-11', lastTxDate: '2026-09-04' }, '2026-10-30');
    expect(c.nextClose).toBe('2026-11-04');
    expect(c.nextDue).toBe('2026-11-11');
  });

  it('sem faturas, assume fechamento em um mês', () => {
    expect(billCycle(null, '2026-10-30')).toEqual({ lastClose: null, nextClose: '2026-11-30', nextDue: null, openAfter: null });
  });
});

describe('fatura recém-fechada que a Pluggy ainda não trouxe', () => {
  it('não soma as compras da fatura que fechou na fatura aberta', () => {
    // Última fatura conhecida fechou 04/10; hoje é 06/11, então a de 04/11 já fechou
    const cycle = billCycle({ dueDate: '2026-10-13', lastTxDate: '2026-10-04' }, '2026-11-06');
    expect(cycle).toMatchObject({ lastClose: '2026-11-04', nextClose: '2026-12-04', openAfter: '2026-11-04' });
    const txs = [
      tx({ localDate: '2026-10-20', amountCents: -10000, description: 'Fatura que fechou', status: 'PENDING' }),
      tx({ localDate: '2026-11-04', amountCents: -2000, description: 'Dia do fechamento', status: 'PENDING' }),
      tx({ localDate: '2026-11-05', amountCents: -3000, description: 'Fatura nova', status: 'PENDING' }),
    ];
    expect(openBillTxs(txs, cycle).map((t) => t.description)).toEqual(['Fatura nova']);
  });
});

describe('fatura aberta e futuras', () => {
  const cycle = { lastClose: '2026-10-04', nextClose: '2026-11-04', nextDue: '2026-11-13' };
  const txs = [
    tx({ localDate: '2026-10-02', amountCents: -1500, description: 'Padaria', billId: 'b1' }),
    tx({ localDate: '2026-10-21', amountCents: -5243, description: 'Hostinger 6/9', status: 'PENDING', installmentNumber: 6, totalInstallments: 9 }),
    tx({ localDate: '2026-10-22', amountCents: -2785, description: 'Tiktok', status: 'PENDING' }),
    tx({ localDate: '2026-10-23', amountCents: 2785, description: 'Crédito Tiktok', status: 'PENDING' }),
    // Pagamento da fatura anterior aparece no cartão: é transferência
    tx({ localDate: '2026-10-04', amountCents: 227184, description: 'Pagamento recebido', status: 'PENDING', isTransfer: true, categoryKind: 'TRANSFER' }),
    tx({ localDate: '2026-11-21', amountCents: -5243, description: 'Hostinger 7/9', status: 'PENDING', installmentNumber: 7, totalInstallments: 9 }),
    tx({ localDate: '2026-12-21', amountCents: -5243, description: 'Hostinger 8/9', status: 'PENDING', installmentNumber: 8, totalInstallments: 9 }),
  ];

  it('fatura aberta: pendentes até o fechamento, estorno abate e pagamento não conta', () => {
    const open = openBillTxs(txs, cycle);
    expect(open.map((t) => t.description)).toEqual(['Hostinger 6/9', 'Tiktok', 'Crédito Tiktok', 'Pagamento recebido']);
    expect(billTotal(open)).toBe(5243);
  });

  it('parcelas futuras por fatura', () => {
    const f = futureBills(txs, cycle, 3);
    expect(f).toEqual([
      { close: '2026-12-04', totalCents: 5243 },
      { close: '2027-01-04', totalCents: 5243 },
      { close: '2027-02-04', totalCents: 0 },
    ]);
  });

  it('parcelamentos: parcela atual e quanto falta', () => {
    const [h] = groupInstallments(txs, cycle);
    expect(h).toMatchObject({ name: 'Hostinger', current: 6, total: 9, installmentCents: 5243, remainingCents: 3 * 5243, lastDate: '2027-01-21' });
  });
});

describe('groupInstallments com dados incompletos (casos reais)', () => {
  const cycle = { lastClose: '2026-10-04', nextClose: '2026-11-04', nextDue: '2026-11-13' };

  it('duas compras na mesma loja e mesmo nº de parcelas ficam separadas pelo mês de início', () => {
    const txs = [
      tx({ localDate: '2026-10-05', amountCents: -31237, description: 'Loja X 4/12', status: 'PENDING', installmentNumber: 4, totalInstallments: 12 }),
      tx({ localDate: '2026-10-20', amountCents: -31243, description: 'Loja X 1/12', status: 'PENDING', installmentNumber: 1, totalInstallments: 12 }),
    ];
    const r = groupInstallments(txs, cycle);
    expect(r.map((i) => `${i.current}/${i.total}`).sort()).toEqual(['1/12', '4/12']);
  });

  it('parcelas com purchaseDate inconsistente da Pluggy ficam juntas (caso real Playstation)', () => {
    const txs = [2, 3, 4].map((n) =>
      tx({
        localDate: `${n === 4 ? '2027-01' : n === 3 ? '2026-12' : '2026-11'}-10`,
        amountCents: -13747,
        description: `Ebn *Playstation ${n}/4`,
        status: 'PENDING',
        installmentNumber: n,
        totalInstallments: 4,
        purchaseDate: `2026-${8 + n}-09`,
      }),
    );
    const r = groupInstallments(txs, cycle);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ current: 1, total: 4, remainingCents: 3 * 13747 });
  });

  it('parcelas com 1 centavo de diferença são a mesma compra', () => {
    const txs = [
      tx({ localDate: '2026-09-10', amountCents: -8502, description: 'Amazon 1/4', installmentNumber: 1, totalInstallments: 4, purchaseDate: '2026-09-10' }),
      tx({ localDate: '2026-10-10', amountCents: -8501, description: 'Amazon 2/4', status: 'PENDING', installmentNumber: 2, totalInstallments: 4, purchaseDate: '2026-09-10' }),
    ];
    const [a] = groupInstallments(txs, cycle);
    expect(a).toMatchObject({ current: 2, total: 4, remainingCents: 2 * 8501 });
  });

  it('parcelamento antigo sem as parcelas seguintes no histórico não aparece como em andamento', () => {
    const txs = [tx({ localDate: '2025-12-04', amountCents: -8502, description: 'Amazon 1/4', installmentNumber: 1, totalInstallments: 4, purchaseDate: '2025-12-04' })];
    expect(groupInstallments(txs, cycle)).toEqual([]);
  });
});

describe('merchantKey', () => {
  it('ignora número da parcela e prefixos de adquirente', () => {
    expect(merchantKey('Dm*Hostinger.Com.Br 6/9')).toBe(merchantKey('DM*HOSTINGER.COM.BR 7/9'));
    expect(merchantKey('Dl *Tiktok')).toBe('tiktok');
  });
});

describe('detectRecurring', () => {
  const months = ['2026-06-27', '2026-07-27', '2026-08-27', '2026-09-27', '2026-10-27'];

  it('assinatura mensal com valor estável é detectada', () => {
    const txs = months.map((d) => tx({ localDate: d, amountCents: -4490, description: 'Netflix Entretenimento' }));
    const [r] = detectRecurring(txs, '2026-10-30');
    expect(r).toMatchObject({ amountCents: 4490, months: 5, lastDate: '2026-10-27', nextDate: '2026-11-27' });
  });

  it('valor oscilando muito não é despesa fixa', () => {
    const txs = months.map((d, i) => tx({ localDate: d, amountCents: -(1000 + i * 900), description: 'Posto Shell' }));
    expect(detectRecurring(txs, '2026-10-30')).toEqual([]);
  });

  it('compras frequentes no mesmo lugar não são assinatura', () => {
    const txs = months.flatMap((d) => [
      tx({ localDate: d, amountCents: -1500, description: 'Cantina' }),
      tx({ localDate: d.replace(/-27$/, '-10'), amountCents: -1500, description: 'Cantina' }),
    ]);
    expect(detectRecurring(txs, '2026-10-30')).toEqual([]);
  });

  it('assinatura cancelada (sem cobrança recente) some da lista', () => {
    const txs = months.slice(0, 3).map((d) => tx({ localDate: d, amountCents: -2190, description: 'Spotify' }));
    expect(detectRecurring(txs, '2026-10-30')).toEqual([]);
  });

  it('IOF se repete mas não é despesa fixa', () => {
    const txs = months.map((d) => tx({ localDate: d, amountCents: -397, description: 'IOF gerado por compra em moeda estrangeira' }));
    expect(detectRecurring(txs, '2026-10-30')).toEqual([]);
  });

  it('parceladas não contam como recorrentes', () => {
    const txs = months.map((d, i) => tx({ localDate: d, amountCents: -5243, description: `Hostinger ${i + 1}/9`, installmentNumber: i + 1, totalInstallments: 9 }));
    expect(detectRecurring(txs, '2026-10-30')).toEqual([]);
  });
});
