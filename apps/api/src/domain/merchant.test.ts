import { describe, expect, it } from 'vitest';
import { buildTxWhere } from '../modules/finance/filters';
import { merchantKey, ruleCategory } from './merchant';

describe('merchantKey (descrições reais do Nubank)', () => {
  it('ignora o prefixo da operação na conta', () => {
    expect(merchantKey('Compra no débito|COOPERALFA ITAIOPOLIS')).toBe('cooperalfa itaiopolis');
    expect(merchantKey('Transferência enviada pelo Pix|Fulano de Tal')).toBe('fulano de tal');
    expect(merchantKey('Transferência Recebida|Kaio Bauer')).toBe('kaio bauer');
  });

  it('ignora adquirente e número de parcela, mas mantém nomes com dígitos', () => {
    expect(merchantKey('Dm*Hostinger.Com.Br 6/9')).toBe(merchantKey('DM*HOSTINGER.COM.BR 7/9'));
    expect(merchantKey('Paddle.Net* N8n Cloud1')).toBe('n8n cloud1');
    expect(merchantKey('Dl *Tiktok')).toBe('tiktok');
  });
});

describe('ruleCategory', () => {
  const rules = new Map([['cooperalfa itaiopolis', 'cat-mercado']]);
  it('aplica a regra pelo estabelecimento, independente da operação', () => {
    expect(ruleCategory('Compra no débito|COOPERALFA ITAIOPOLIS', rules)).toBe('cat-mercado');
    expect(ruleCategory('COOPERALFA ITAIOPOLIS', rules)).toBe('cat-mercado');
    expect(ruleCategory('Outra loja', rules)).toBeNull();
  });
});

describe('buildTxWhere', () => {
  const flat = (w: unknown) => JSON.stringify(w);

  it('nunca lista parcelas futuras, mesmo com "até" no futuro', () => {
    expect(flat(buildTxWhere({ to: '2027-06-01' }, '2026-10-30'))).toContain('"lte":"2026-10-30"');
    expect(flat(buildTxWhere({ to: '2026-09-30' }, '2026-10-30'))).toContain('"lte":"2026-09-30"');
  });

  it('gastos excluem transferências e entradas', () => {
    const w = flat(buildTxWhere({ type: 'expense' }, '2026-10-30'));
    expect(w).toContain('"isTransfer":false');
    expect(w).toContain('"amountCents":{"lt":0}');
  });

  it('busca em descrição, estabelecimento, notas e tags', () => {
    const w = flat(buildTxWhere({ q: 'Uber' }, '2026-10-30'));
    expect(w).toContain('"description":{"contains":"Uber","mode":"insensitive"}');
    expect(w).toContain('"tags":{"has":"uber"}');
  });
});
