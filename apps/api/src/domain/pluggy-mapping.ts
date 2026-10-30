import { localDate, toCents } from '@financas/shared';

/**
 * Regras puras de tradução dos dados da Pluggy para o modelo do app.
 * Ficam separadas do cliente HTTP para poderem ser testadas sem rede.
 */

export type PluggyTxType = 'DEBIT' | 'CREDIT';

/** Saída negativa, entrada positiva. Usa o `type` porque o sinal de `amount` varia entre conectores. */
export function signedCents(amount: number, type: PluggyTxType): number {
  const abs = Math.abs(toCents(amount));
  return type === 'DEBIT' ? -abs : abs;
}

/**
 * Valor na moeda da conta (BRL). Em compras internacionais a Pluggy manda `amount` na moeda
 * original (ex.: 21.77 USD) e o valor convertido em `amountInAccountCurrency` (113.52 BRL).
 */
export function accountAmount(t: { amount: number; amountInAccountCurrency?: number | null }): number {
  return t.amountInAccountCurrency ?? t.amount;
}

/**
 * Data local (America/Sao_Paulo) de uma transação.
 * A Pluggy manda datas "puras" como meia-noite UTC; converter de fuso jogaria para o dia anterior.
 */
export function pluggyLocalDate(iso: string): string {
  if (/T00:00:00(\.000)?Z$/.test(iso)) return iso.slice(0, 10);
  return localDate(new Date(iso));
}

export interface MappedCategory {
  /** Nome de uma das categorias padrão (ver finance/defaults.ts) */
  name: string;
  isTransfer: boolean;
}

/**
 * Transferências identificadas pela descrição: a Pluggy às vezes classifica o pagamento
 * da fatura só como "Transfers", e contá-lo como gasto duplicaria as compras do cartão.
 */
const TRANSFER_DESCRIPTION = /pagamento (de |da )?fatura|pagto fatura|pgto fatura|resgate|aplica[cç][aã]o (rdb|cdb)/i;

const RULES: { re: RegExp; name: string; transfer?: boolean }[] = [
  // Dinheiro que só muda de lugar entre contas próprias: não é gasto nem entrada
  { re: /same (person|ownership)|mesma titularidade|entre contas|transfer - internal/i, name: 'Transferências', transfer: true },
  { re: /credit card payment|pagamento de (fatura|cart[aã]o)/i, name: 'Transferências', transfer: true },
  { re: /investment|investimento|aplica[cç][aã]o|resgate|fixed income|renda fixa/i, name: 'Transferências', transfer: true },
  { re: /groceries|supermarket|supermercado|mercado/i, name: 'Mercado' },
  { re: /food|restaurant|eating out|delivery|alimenta|restaurante|\bbars?\b/i, name: 'Alimentação' },
  { re: /transport|taxi|ride|uber|fuel|gas station|parking|toll|combust|estacionamento|ped[aá]gio|public transport/i, name: 'Transporte' },
  { re: /housing|rent|utilities|electricity|water|internet|telecom|mobile|aluguel|moradia|energia|condom/i, name: 'Casa' },
  { re: /subscription|streaming|digital services|assinatura/i, name: 'Assinaturas' },
  {
    re: /leisure|entertainment|travel|tickets|lodging|accom+odation|airline|cinema|theater|concert|gaming|gambling|sports|wellness|fitness|lazer|viagem|hotel/i,
    name: 'Lazer',
  },
  { re: /health|pharmacy|medical|dentist|hospital|optometry|sa[uú]de|farm[aá]cia/i, name: 'Saúde' },
  { re: /education|school|course|bookstore|educa[cç][aã]o|escola|curso|livraria/i, name: 'Educação' },
  { re: /shopping|clothing|electronics|online shopping|department store|compras|vestu[aá]rio/i, name: 'Compras' },
  { re: /salary|wages|payroll|sal[aá]rio/i, name: 'Salário' },
];

/** Traduz a categoria da Pluggy (e, quando preciso, a descrição) para uma das categorias do app. */
export function mapCategory(
  pluggyCategory: string | null | undefined,
  type: PluggyTxType,
  description = '',
): MappedCategory {
  if (TRANSFER_DESCRIPTION.test(description)) return { name: 'Transferências', isTransfer: true };
  const text = pluggyCategory ?? '';
  for (const rule of RULES) {
    if (!rule.re.test(text)) continue;
    // "Salário" só faz sentido como entrada; numa saída cai em Outros
    if (rule.name === 'Salário' && type === 'DEBIT') break;
    return { name: rule.name, isTransfer: !!rule.transfer };
  }
  return { name: type === 'CREDIT' ? 'Outras entradas' : 'Outros', isTransfer: false };
}

/** Descrição curta para comparar transações (pendente x lançada). */
export function normalizeDescription(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface ExistingTx {
  id: string;
  pluggyId: string;
  amountCents: number;
  localDate: string;
  description: string;
  status: string | null;
}

export interface IncomingTx {
  pluggyId: string;
  amountCents: number;
  localDate: string;
  description: string;
}

export interface ReconcilePlan {
  /** pluggyIds novos que não substituem nenhuma pendente */
  create: string[];
  /** pluggyIds que já existem: atualizar campos vindos do banco */
  update: string[];
  /** Pendente que sumiu e foi substituída pela lançada: herda notas/categoria e troca de pluggyId */
  replace: { existingId: string; pluggyId: string }[];
  /** Ids locais que sumiram da janela sincronizada (excluídos ou pendências canceladas) */
  remove: string[];
}

const MAX_REPLACE_DAYS = 5;

function daysBetween(a: string, b: string) {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

function similar(a: string, b: string) {
  const x = normalizeDescription(a);
  const y = normalizeDescription(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(y) || y.startsWith(x) || x.split(' ')[0] === y.split(' ')[0];
}

/**
 * Compara o que existe localmente numa conta/janela de datas com o que a Pluggy devolveu.
 * Deduplicação por pluggyId; uma pendente que vira lançada com outro id é reaproveitada
 * (mesmo valor, data próxima, descrição parecida) para não perder edições do usuário.
 */
export function reconcile(existing: ExistingTx[], incoming: IncomingTx[]): ReconcilePlan {
  const byPluggyId = new Map(existing.map((e) => [e.pluggyId, e]));
  const incomingIds = new Set(incoming.map((t) => t.pluggyId));
  const plan: ReconcilePlan = { create: [], update: [], replace: [], remove: [] };

  // Locais que sumiram da resposta: candidatas a substituição ou remoção
  const vanished = existing.filter((e) => !incomingIds.has(e.pluggyId));
  const usedVanished = new Set<string>();

  for (const tx of incoming) {
    if (byPluggyId.has(tx.pluggyId)) {
      plan.update.push(tx.pluggyId);
      continue;
    }
    const match = vanished.find(
      (v) =>
        !usedVanished.has(v.id) &&
        v.status === 'PENDING' &&
        v.amountCents === tx.amountCents &&
        daysBetween(v.localDate, tx.localDate) <= MAX_REPLACE_DAYS &&
        similar(v.description, tx.description),
    );
    if (match) {
      usedVanished.add(match.id);
      plan.replace.push({ existingId: match.id, pluggyId: tx.pluggyId });
    } else {
      plan.create.push(tx.pluggyId);
    }
  }

  plan.remove = vanished.filter((v) => !usedVanished.has(v.id)).map((v) => v.id);
  return plan;
}

/** Categoria da Pluggy para transferência entre contas do mesmo titular. */
export const SAME_PERSON_CATEGORY = /same (person|ownership)|mesma titularidade/i;

export interface OwnTransferTx {
  id: string;
  accountId: string;
  amountCents: number;
  localDate: string;
  pluggyCategory: string | null;
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/**
 * Entradas "da mesma pessoa" que vêm de uma conta própria que não está no app (ex.: o salário
 * caindo em outro banco e repassado). Sem a saída correspondente numa conta conectada, o dinheiro
 * é novo para o app: conta como entrada, não como transferência.
 * Devolve os ids dessas entradas; as que têm contrapartida (mesmo valor, até `windowDays` dias,
 * outra conta) continuam transferências. Cada saída casa com uma só entrada.
 */
export function unmatchedOwnTransfers(txs: OwnTransferTx[], windowDays = 3): string[] {
  const outgoing = txs.filter((t) => t.amountCents < 0);
  const used = new Set<string>();
  const unmatched: string[] = [];
  const incoming = txs
    .filter((t) => t.amountCents > 0 && SAME_PERSON_CATEGORY.test(t.pluggyCategory ?? ''))
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  for (const t of incoming) {
    const match = outgoing
      .filter(
        (o) =>
          !used.has(o.id) &&
          o.accountId !== t.accountId &&
          o.amountCents === -t.amountCents &&
          dayDiff(o.localDate, t.localDate) <= windowDays,
      )
      .sort((a, b) => dayDiff(a.localDate, t.localDate) - dayDiff(b.localDate, t.localDate))[0];
    if (match) used.add(match.id);
    else unmatched.push(t.id);
  }
  return unmatched;
}
