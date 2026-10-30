import { normalizeDescription } from './pluggy-mapping';

/** Prefixos de operação que não identificam o estabelecimento (extrato do Nubank e similares). */
const OPERATION_PREFIX =
  /^(compra no debito|compra no credito|transferencia (enviada|recebida)( pelo pix)?|pix (enviado|recebido)|pagamento efetuado|pagamento de boleto efetuado|debito automatico)\s+/;

/** Prefixos de adquirentes/gateways ("DL *Tiktok", "PAG*Loja") */
const ACQUIRER_PREFIX = /^(dl|dm|ebn|pg|pag|mp|jim com|ifd|ec|paddle net|pp)\s+/;

/**
 * Chave estável do estabelecimento: base para "transações parecidas" e regras de categoria.
 * Remove número de parcela ("6/9"), números soltos, prefixos de operação e de adquirente.
 */
export function merchantKey(description: string): string {
  return normalizeDescription(description)
    .replace(/\b\d+\s*\d*\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(OPERATION_PREFIX, '')
    .replace(ACQUIRER_PREFIX, '')
    .trim();
}

export interface Rule {
  pattern: string;
  categoryId: string;
}

/** Categoria definida por regra do usuário para esta descrição, se houver. */
export function ruleCategory(description: string, rules: Map<string, string>): string | null {
  const key = merchantKey(description);
  return key ? (rules.get(key) ?? null) : null;
}
