import { describe, expect, it } from 'vitest';
import { connectionHealth } from './connection-health';
import { accountAmount, mapCategory, pluggyLocalDate, reconcile, signedCents, type ExistingTx, unmatchedOwnTransfers } from './pluggy-mapping';

describe('accountAmount', () => {
  it('compra internacional usa o valor em reais, não o em dólar (caso real Claude)', () => {
    const t = { amount: 21.77, currencyCode: 'USD', amountInAccountCurrency: 113.52 };
    expect(signedCents(accountAmount(t), 'DEBIT')).toBe(-11352);
  });
  it('compra em reais sem o campo convertido usa amount', () => {
    expect(accountAmount({ amount: 12.9, amountInAccountCurrency: null })).toBe(12.9);
    expect(accountAmount({ amount: 12.9 })).toBe(12.9);
  });
});

describe('signedCents', () => {
  it('usa o type e ignora o sinal de amount', () => {
    expect(signedCents(48.9, 'DEBIT')).toBe(-4890);
    expect(signedCents(-48.9, 'DEBIT')).toBe(-4890);
    expect(signedCents(-6500, 'CREDIT')).toBe(650000);
    expect(signedCents(0.1 + 0.2, 'CREDIT')).toBe(30);
  });
});

describe('pluggyLocalDate', () => {
  it('data pura (meia-noite UTC) não muda de dia', () => {
    expect(pluggyLocalDate('2026-10-30T00:00:00.000Z')).toBe('2026-10-30');
  });
  it('data com hora é convertida para São Paulo', () => {
    // 01:30 UTC = 22:30 do dia anterior em SP
    expect(pluggyLocalDate('2026-10-30T01:30:00.000Z')).toBe('2026-10-29');
    expect(pluggyLocalDate('2026-10-30T15:00:00.000Z')).toBe('2026-10-30');
  });
});

describe('mapCategory', () => {
  it('mapeia categorias comuns da Pluggy', () => {
    expect(mapCategory('Food and drinks - Groceries', 'DEBIT')).toEqual({ name: 'Mercado', isTransfer: false });
    expect(mapCategory('Eating out', 'DEBIT').name).toBe('Alimentação');
    expect(mapCategory('Taxi and ride-hailing', 'DEBIT').name).toBe('Transporte');
    expect(mapCategory('Video streaming', 'DEBIT').name).toBe('Assinaturas');
    expect(mapCategory('Salary', 'CREDIT').name).toBe('Salário');
  });

  it('transferências entre contas próprias, fatura e investimentos não contam como gasto', () => {
    expect(mapCategory('Same person transfer - PIX', 'DEBIT')).toEqual({ name: 'Transferências', isTransfer: true });
    expect(mapCategory('Credit card payment', 'DEBIT').isTransfer).toBe(true);
    expect(mapCategory('Investments', 'DEBIT').isTransfer).toBe(true);
  });

  it('pagamento de fatura na conta é transferência mesmo com categoria genérica (dado real do Nubank)', () => {
    expect(mapCategory('Transfers', 'DEBIT', 'Pagamento de fatura')).toEqual({ name: 'Transferências', isTransfer: true });
    expect(mapCategory('Transfer - Internal', 'CREDIT', 'Transferência interna').isTransfer).toBe(true);
    // PIX para outra pessoa continua sendo gasto
    expect(mapCategory('Transfers', 'DEBIT', 'Transferência enviada pelo Pix|Fulano').isTransfer).toBe(false);
  });

  it('categorias reais que caíam em Outros', () => {
    expect(mapCategory('Accomodation', 'DEBIT').name).toBe('Lazer');
    expect(mapCategory('Wellness and fitness', 'DEBIT').name).toBe('Lazer');
    expect(mapCategory('Cinema, theater and concerts', 'DEBIT').name).toBe('Lazer');
    expect(mapCategory('Optometry', 'DEBIT').name).toBe('Saúde');
    expect(mapCategory('Mobile', 'DEBIT').name).toBe('Casa');
  });

  it('sem categoria conhecida: Outros para saída, Outras entradas para entrada', () => {
    expect(mapCategory(null, 'DEBIT').name).toBe('Outros');
    expect(mapCategory('Something new', 'CREDIT').name).toBe('Outras entradas');
    // Salário numa saída não faz sentido
    expect(mapCategory('Salary', 'DEBIT').name).toBe('Outros');
  });
});

describe('connectionHealth', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  const base = { status: 'UPDATED', consentExpiresAt: null, lastSyncError: null, lastSyncAt: now };
  const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);

  it('ok, erro de login e consentimento expirando/expirado', () => {
    expect(connectionHealth(base, now)).toBe('ok');
    expect(connectionHealth({ ...base, status: 'LOGIN_ERROR' }, now)).toBe('error');
    expect(connectionHealth({ ...base, consentExpiresAt: inDays(5) }, now)).toBe('expiring');
    expect(connectionHealth({ ...base, consentExpiresAt: inDays(30) }, now)).toBe('ok');
    expect(connectionHealth({ ...base, consentExpiresAt: inDays(-1) }, now)).toBe('expired');
  });

  it('nunca sincronizado aparece como sincronizando', () => {
    expect(connectionHealth({ ...base, lastSyncAt: null }, now)).toBe('syncing');
  });
});

describe('reconcile (deduplicação)', () => {
  const existing: ExistingTx[] = [
    { id: 'a', pluggyId: 'p1', amountCents: -4890, localDate: '2026-10-28', description: 'IFOOD *Pedido', status: 'POSTED' },
    { id: 'b', pluggyId: 'p2', amountCents: -2350, localDate: '2026-10-29', description: 'UBER *TRIP', status: 'PENDING' },
    { id: 'c', pluggyId: 'p3', amountCents: -1000, localDate: '2026-10-29', description: 'Compra cancelada', status: 'PENDING' },
  ];

  it('mesmo pluggyId atualiza, não duplica', () => {
    const plan = reconcile(existing, [{ pluggyId: 'p1', amountCents: -4890, localDate: '2026-10-28', description: 'IFOOD *Pedido' }]);
    expect(plan.update).toEqual(['p1']);
    expect(plan.create).toEqual([]);
  });

  it('pendente que virou lançada com outro id é substituída, não duplicada', () => {
    const plan = reconcile(existing, [
      { pluggyId: 'p1', amountCents: -4890, localDate: '2026-10-28', description: 'IFOOD *Pedido' },
      { pluggyId: 'p9', amountCents: -2350, localDate: '2026-10-31', description: 'Uber Trip' },
    ]);
    expect(plan.replace).toEqual([{ existingId: 'b', pluggyId: 'p9' }]);
    expect(plan.create).toEqual([]);
    // A pendência cancelada (sumiu e nada a substituiu) é removida
    expect(plan.remove).toEqual(['c']);
  });

  it('valor diferente não é tratado como a mesma compra', () => {
    const plan = reconcile(existing, [{ pluggyId: 'p9', amountCents: -2400, localDate: '2026-10-30', description: 'UBER *TRIP' }]);
    expect(plan.replace).toEqual([]);
    expect(plan.create).toEqual(['p9']);
  });

  it('cada pendente só substitui uma transação', () => {
    const plan = reconcile(existing, [
      { pluggyId: 'x1', amountCents: -2350, localDate: '2026-10-30', description: 'UBER *TRIP' },
      { pluggyId: 'x2', amountCents: -2350, localDate: '2026-10-30', description: 'UBER *TRIP' },
    ]);
    expect(plan.replace).toHaveLength(1);
    expect(plan.create).toHaveLength(1);
  });
});

describe('unmatchedOwnTransfers', () => {
  const tx = (id: string, accountId: string, amountCents: number, localDate: string, pluggyCategory: string | null = null) => ({
    id,
    accountId,
    amountCents,
    localDate,
    pluggyCategory,
  });

  it('salário vindo de conta própria fora do app vira entrada (caso real Nubank)', () => {
    const txs = [tx('sal', 'nu', 406850, '2026-10-03', 'Same person transfer'), tx('x', 'nu', -5000, '2026-10-03', 'Groceries')];
    expect(unmatchedOwnTransfers(txs)).toEqual(['sal']);
  });

  it('com a saída correspondente em outra conta conectada continua transferência', () => {
    const txs = [
      tx('in', 'nu', 100000, '2026-10-03', 'Same person transfer'),
      tx('out', 'itau', -100000, '2026-10-02', 'Same person transfer'),
    ];
    expect(unmatchedOwnTransfers(txs)).toEqual([]);
  });

  it('saída na mesma conta, valor diferente ou fora da janela não contam como contrapartida', () => {
    const txs = [
      tx('a', 'nu', 100000, '2026-10-10', 'Same person transfer'),
      tx('b', 'nu', -100000, '2026-10-10'),
      tx('c', 'itau', -99999, '2026-10-10'),
      tx('d', 'itau', -100000, '2026-10-20'),
    ];
    expect(unmatchedOwnTransfers(txs)).toEqual(['a']);
  });

  it('cada saída casa com uma só entrada', () => {
    const txs = [
      tx('in1', 'nu', 5000, '2026-10-01', 'Same person transfer'),
      tx('in2', 'nu', 5000, '2026-10-02', 'Same person transfer'),
      tx('out', 'itau', -5000, '2026-10-01'),
    ];
    expect(unmatchedOwnTransfers(txs)).toEqual(['in2']);
  });

  it('ignora entradas que não são da mesma pessoa', () => {
    expect(unmatchedOwnTransfers([tx('pix', 'nu', 8000, '2026-10-27', 'Transfers')])).toEqual([]);
  });
});
