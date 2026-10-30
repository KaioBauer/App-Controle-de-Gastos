import { describe, expect, it } from 'vitest';
import {
  budgetNotices,
  connectionNotices,
  dueNotices,
  enabledOnly,
  lowBalanceNotices,
  monthlySummaryNotice,
  newTransactionNotices,
  unusualNotices,
  weeklySummaryNotice,
  type TxInfo,
} from './notifications';

const tx = (p: Partial<TxInfo> & Pick<TxInfo, 'id' | 'amountCents'>): TxInfo => ({
  description: 'Compra no débito|PADARIA',
  isTransfer: false,
  categoryId: 'food',
  categoryName: 'Alimentação',
  ...p,
});
const norm = (s: string) => s.replace(/\s/g, ' ');

describe('newTransactionNotices', () => {
  it('uma notificação por transação, com valor, estabelecimento e categoria', () => {
    const [n] = newTransactionNotices([tx({ id: 'a', amountCents: -4890 })], 0);
    expect(n!.dedupeKey).toBe('newtx:a');
    expect(n!.title).toBe('Nova compra');
    expect(norm(n!.body)).toBe('R$ 48,90 em PADARIA · Alimentação');
    expect(n!.url).toBe('/transacoes?unreviewed=1');
  });

  it('respeita o valor mínimo e ignora transferências', () => {
    const r = newTransactionNotices(
      [tx({ id: 'a', amountCents: -500 }), tx({ id: 'b', amountCents: -20000, isTransfer: true }), tx({ id: 'c', amountCents: -5000 })],
      1000,
    );
    expect(r.map((n) => n.dedupeKey)).toEqual(['newtx:c']);
  });

  it('muitas de uma vez viram um resumo', () => {
    const r = newTransactionNotices(['a', 'b', 'c', 'd'].map((id) => tx({ id, amountCents: -1000 })), 0);
    expect(r).toHaveLength(1);
    expect(r[0]!.title).toBe('4 novas transações');
    expect(norm(r[0]!.body)).toContain('R$ 40,00 em gastos');
  });
});

describe('budgetNotices', () => {
  const base = { categoryId: 'food', name: 'Mercado', limitCents: 50000 };
  it('80% e 100% têm chaves diferentes, por mês', () => {
    expect(budgetNotices([{ ...base, pct: 85, spentCents: 42500 }], '2026-10')[0]!.dedupeKey).toBe('budget:food:2026-10:80');
    const [over] = budgetNotices([{ ...base, pct: 110, spentCents: 55000 }], '2026-10');
    expect(over!.dedupeKey).toBe('budget:food:2026-10:100');
    expect(over!.title).toBe('Orçamento de Mercado estourado');
  });
  it('abaixo de 80% não avisa', () => {
    expect(budgetNotices([{ ...base, pct: 79.9, spentCents: 39950 }], '2026-10')).toEqual([]);
  });
});

describe('dueNotices', () => {
  const bill = { key: 'card1', name: 'Fatura do Cartão Platinum', amountCents: 248070, dueDate: '2026-11-13', url: '/cartoes' };
  it('avisa 3 dias antes e no dia', () => {
    expect(dueNotices([bill], '2026-11-10')[0]!.title).toBe('Fatura do Cartão Platinum vence em 3 dias');
    expect(dueNotices([bill], '2026-11-13')[0]!.dedupeKey).toBe('due:card1:2026-11-13:d0');
    expect(dueNotices([bill], '2026-11-11')).toEqual([]);
  });
});

describe('lowBalanceNotices', () => {
  it('uma vez por dia por conta', () => {
    const r = lowBalanceNotices([{ id: 'acc', name: 'Nubank', balanceCents: 5000 }, { id: 'ok', name: 'Outra', balanceCents: 90000 }], 10000, '2026-10-30');
    expect(r.map((n) => n.dedupeKey)).toEqual(['lowbal:acc:2026-10-30']);
  });
  it('limite zero desliga', () => {
    expect(lowBalanceNotices([{ id: 'acc', name: 'Nubank', balanceCents: -100 }], 0, '2026-10-30')).toEqual([]);
  });
});

describe('unusualNotices', () => {
  const history = new Map([['food', [3000, 4000, 3500, 5000, 4500, 3800]]]);
  it('3× a mediana da categoria e acima de R$ 100', () => {
    const r = unusualNotices([tx({ id: 'x', amountCents: -15000 })], history);
    expect(r[0]!.dedupeKey).toBe('unusual:x');
    expect(norm(r[0]!.body)).toContain('O normal nessa categoria é R$ 39,00');
  });
  it('sem histórico suficiente, ou valor normal, não avisa', () => {
    expect(unusualNotices([tx({ id: 'x', amountCents: -15000, categoryId: 'nova' })], history)).toEqual([]);
    expect(unusualNotices([tx({ id: 'y', amountCents: -9000 })], history)).toEqual([]);
  });
});

describe('resumos', () => {
  it('semanal com comparação e maior categoria', () => {
    const n = weeklySummaryNotice('2026-10-26', 50000, 40000, { name: 'Mercado', cents: 20000 });
    expect(n.dedupeKey).toBe('weekly:2026-10-26');
    expect(norm(n.body)).toBe('Você gastou R$ 500,00 (25% a mais que a semana anterior). Maior categoria: Mercado, R$ 200,00.');
  });
  it('mensal com saldo e orçamentos estourados', () => {
    const n = monthlySummaryNotice('2026-10', 500000, 650000, 2);
    expect(n.title).toBe('Fechamento de outubro');
    expect(norm(n.body)).toContain('sobrou R$ 1.500,00');
    expect(n.body).toContain('2 orçamentos estouraram');
  });
});

describe('connectionNotices', () => {
  it('erro uma vez por dia; consentimento 7 dias e 1 dia antes', () => {
    const base = { itemId: 'i', name: 'Nubank', error: null };
    expect(connectionNotices([{ ...base, error: 'Senha inválida.', consentExpiresAt: null }], '2026-10-30')[0]!.dedupeKey).toBe('sync:i:2026-10-30');
    expect(connectionNotices([{ ...base, consentExpiresAt: '2026-11-05' }], '2026-10-30')[0]!.dedupeKey).toBe('consent:i:2026-11-05:week');
    expect(connectionNotices([{ ...base, consentExpiresAt: '2026-10-31' }], '2026-10-30')[0]!.dedupeKey).toBe('consent:i:2026-10-31:last');
    expect(connectionNotices([{ ...base, consentExpiresAt: '2027-10-30' }], '2026-10-30')).toEqual([]);
  });
});

describe('enabledOnly', () => {
  it('respeita os tipos desligados nos Ajustes', () => {
    const notices = newTransactionNotices([tx({ id: 'a', amountCents: -1000 })], 0);
    const all = { newTransaction: true, budget: true, billsDue: true, lowBalance: true, unusualSpending: true, weeklySummary: true, monthlySummary: true, syncErrors: true };
    expect(enabledOnly(notices, all)).toHaveLength(1);
    expect(enabledOnly(notices, { ...all, newTransaction: false })).toHaveLength(0);
  });
});
