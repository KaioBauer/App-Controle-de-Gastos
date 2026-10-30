import { describe, expect, it } from 'vitest';
import { bucketRange, buildAnalysis, periodRange } from './analysis';
import { budgetProgress, incomeOf, spendingByCategory, spendingOf, type FlowTx } from './spending';

const tx = (p: Partial<FlowTx> & Pick<FlowTx, 'amountCents' | 'localDate'>): FlowTx => ({
  categoryId: 'food',
  categoryKind: 'EXPENSE',
  isTransfer: false,
  ...p,
});

describe('spendingOf / incomeOf', () => {
  it('gasto conta positivo e estorno na mesma categoria reduz', () => {
    expect(spendingOf(tx({ amountCents: -4890, localDate: '2026-10-01' }))).toBe(4890);
    expect(spendingOf(tx({ amountCents: 1000, localDate: '2026-10-01' }))).toBe(-1000);
  });

  it('transferências entre contas próprias não contam como gasto nem entrada', () => {
    const t = tx({ amountCents: -50000, localDate: '2026-10-01', isTransfer: true });
    expect(spendingOf(t)).toBe(0);
    expect(incomeOf(t)).toBe(0);
    expect(spendingOf(tx({ amountCents: -50000, localDate: '2026-10-01', categoryKind: 'TRANSFER' }))).toBe(0);
  });

  it('sem categoria, o sinal decide', () => {
    const base = { categoryId: null, categoryKind: null, localDate: '2026-10-01' } as const;
    expect(spendingOf(tx({ ...base, amountCents: -100 }))).toBe(100);
    expect(spendingOf(tx({ ...base, amountCents: 100 }))).toBe(0);
    expect(incomeOf(tx({ ...base, amountCents: 100 }))).toBe(100);
  });

  it('agrupa por categoria', () => {
    const m = spendingByCategory([
      tx({ amountCents: -100, localDate: '2026-10-01' }),
      tx({ amountCents: -300, localDate: '2026-10-02' }),
      tx({ amountCents: -50, localDate: '2026-10-02', categoryId: 'bus' }),
    ]);
    expect(m.get('food')).toBe(400);
    expect(m.get('bus')).toBe(50);
  });
});

describe('budgetProgress', () => {
  it('status por faixa: ok, 80%, 100% e acima', () => {
    expect(budgetProgress(40000, 13620, '2026-10-15').status).toBe('ok');
    expect(budgetProgress(10000, 8000, '2026-10-15').status).toBe('warn');
    expect(budgetProgress(165000, 165000, '2026-10-15').status).toBe('full');
    expect(budgetProgress(10000, 12190, '2026-10-15').status).toBe('over');
  });

  it('projeta linearmente até o fim do mês', () => {
    // 31 dias em outubro: R$ 100 no dia 10 -> R$ 310
    expect(budgetProgress(50000, 10000, '2026-10-10').projectedCents).toBe(31000);
  });

  it('limite zero não divide por zero', () => {
    expect(budgetProgress(0, 0, '2026-10-01')).toMatchObject({ pct: 0, status: 'ok' });
  });
});

describe('periodRange', () => {
  it('semana começa na segunda', () => {
    // 30/10/2026 é sexta
    const r = periodRange('week', '2026-10-30');
    expect(r.start).toBe('2026-10-26');
    expect(r.end).toBe('2026-11-01');
    expect(r.prevToDateEnd).toBe('2026-10-23');
  });

  it('mês compara com o mesmo dia do mês anterior, limitado ao tamanho dele', () => {
    const r = periodRange('month', '2026-03-31');
    expect(r.prevStart).toBe('2026-02-01');
    expect(r.prevToDateEnd).toBe('2026-02-28');
    expect(r.bucketOf('2026-03-31')).toBe(4);
    expect(r.bucketOf('2026-03-07')).toBe(0);
    expect(r.bucketOf('2026-03-08')).toBe(1);
  });
});

describe('buildAnalysis', () => {
  const cats = new Map([
    ['food', { id: 'food', name: 'Alimentação', icon: 'food' }],
    ['home', { id: 'home', name: 'Casa', icon: 'home' }],
  ]);

  it('soma o período, monta barras, categorias e variação', () => {
    const txs = [
      // setembro até o dia 15
      tx({ amountCents: -20000, localDate: '2026-09-05' }),
      tx({ amountCents: -100000, localDate: '2026-09-10', categoryId: 'home' }),
      // outubro
      tx({ amountCents: -10000, localDate: '2026-10-03' }),
      tx({ amountCents: -100000, localDate: '2026-10-09', categoryId: 'home' }),
      tx({ amountCents: 650000, localDate: '2026-10-05', categoryId: 'salary', categoryKind: 'INCOME' }),
    ];
    // Só Alimentação é orçada: o aluguel (Casa) não entra na projeção contra o limite
    const a = buildAnalysis('month', '2026-10-15', txs, cats, { totalCents: 30000, categoryIds: new Set(['food']) });

    expect(a.totalCents).toBe(110000);
    expect(a.bars.map((b) => b.cents)).toEqual([10000, 100000, 0, 0, 0]);
    expect(a.categories.map((c) => c.name)).toEqual(['Casa', 'Alimentação']);
    expect(a.deltaPct).toBe(-8); // 110000 vs 120000
    // Casa ficou igual; Alimentação caiu R$ 100 (de R$ 200 para R$ 100)
    expect(a.insight?.title).toBe('Alimentação caiu 50%');
    expect(a.insight?.body).toContain('no mesmo trecho em setembro.');
    expect(a.insight?.body).toContain('sobrando');
  });

  it('base pequena no período anterior: fala em reais, não em "1866%"', () => {
    const txs = [
      tx({ amountCents: -1000, localDate: '2026-09-05', categoryId: 'food' }),
      tx({ amountCents: -19660, localDate: '2026-10-05', categoryId: 'food' }),
    ];
    const a = buildAnalysis('month', '2026-10-15', txs, cats);
    expect(a.insight?.title).toMatch(/^Alimentação subiu R\$\s?186,60$/);
    expect(a.deltaPct).toBeNull();
  });

  it('escolhe a categoria que mais mudou em reais, não a de maior percentual', () => {
    const txs = [
      tx({ amountCents: -10000, localDate: '2026-09-05', categoryId: 'food' }),
      tx({ amountCents: -30000, localDate: '2026-10-05', categoryId: 'food' }),
      tx({ amountCents: -100000, localDate: '2026-09-05', categoryId: 'home' }),
      tx({ amountCents: -160000, localDate: '2026-10-05', categoryId: 'home' }),
    ];
    const a = buildAnalysis('month', '2026-10-15', txs, cats);
    expect(a.insight?.title).toBe('Casa subiu 60%');
  });

  it('sem histórico não inventa variação nem insight', () => {
    const a = buildAnalysis('week', '2026-10-30', [tx({ amountCents: -500, localDate: '2026-10-28' })], cats);
    expect(a.deltaPct).toBeNull();
    expect(a.insight).toBeNull();
    expect(a.bars[2]!.cents).toBe(500);
  });
});

describe('bucketRange', () => {
  it('semana: um dia por barra', () => {
    expect(bucketRange('week', '2026-10-26', 3)).toEqual({ from: '2026-10-29', to: '2026-10-29' });
  });
  it('mês: semanas de 7 dias e a 5ª vai até o fim do mês', () => {
    expect(bucketRange('month', '2026-10-01', 0)).toEqual({ from: '2026-10-01', to: '2026-10-07' });
    expect(bucketRange('month', '2026-10-01', 4)).toEqual({ from: '2026-10-29', to: '2026-10-31' });
  });
  it('ano: um mês por barra', () => {
    expect(bucketRange('year', '2026-01-01', 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});
