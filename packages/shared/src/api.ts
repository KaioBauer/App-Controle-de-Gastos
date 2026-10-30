/** Contratos JSON entre API e web. Valores monetários sempre em centavos inteiros. */

export type CategoryKind = 'EXPENSE' | 'INCOME' | 'TRANSFER';

export interface CategoryDTO {
  id: string;
  name: string;
  icon: string;
  kind: CategoryKind;
}

export interface TransactionDTO {
  id: string;
  description: string;
  amountCents: number;
  localDate: string;
  /** ISO, para mostrar a hora */
  date: string;
  category: CategoryDTO | null;
  accountId: string;
  accountName: string;
  accountType: 'BANK' | 'CREDIT' | 'INVESTMENT' | 'CASH';
  isTransfer: boolean;
  reviewed: boolean;
  /** Lançamento manual: pode ser editado e apagado */
  manual: boolean;
  notes: string | null;
  tags: string[];
  status: string | null;
  installment: { number: number; total: number } | null;
}

export interface TransactionListDTO {
  items: TransactionDTO[];
  nextCursor: string | null;
  /** Só na primeira página: somas de tudo que bate com o filtro */
  totals?: { count: number; expenseCents: number; incomeCents: number };
}

export interface AccountDTO {
  id: string;
  name: string;
  type: 'BANK' | 'CREDIT' | 'INVESTMENT' | 'CASH';
}

export interface RuleDTO {
  id: string;
  label: string;
  category: CategoryDTO;
  /** Quantas transações a regra cobre hoje */
  matches: number;
}

export interface SummaryDTO {
  month: string;
  balanceCents: number;
  monthSpentCents: number;
  monthIncomeCents: number;
  /** Soma dos limites de orçamento; 0 quando não há orçamentos */
  budgetTotalCents: number;
  /** Gasto do mês só nas categorias orçadas (comparável ao limite) */
  budgetSpentCents: number;
  recent: TransactionDTO[];
}

export type Period = 'week' | 'month' | 'year';

export interface AnalysisDTO {
  period: Period;
  /** Nome do período atual ("esta semana", "outubro", "2026") */
  name: string;
  totalCents: number;
  /** Variação percentual vs. o mesmo trecho do período anterior; null sem base de comparação */
  deltaPct: number | null;
  /** Rótulo do período anterior ("anterior", "setembro", "2025") */
  previousName: string;
  bars: { label: string; name: string; cents: number }[];
  categories: { id: string; name: string; icon: string; cents: number }[];
  insight: { title: string; body: string } | null;
}

export interface CardDTO {
  accountId: string;
  name: string;
  limitCents: number | null;
  availableCents: number | null;
  /** Limite usado (inclui parcelas futuras) */
  usedCents: number;
  openBill: {
    totalCents: number;
    /** Datas estimadas (YYYY-MM-DD): a Pluggy não informa o fechamento */
    closeDate: string;
    dueDate: string | null;
    transactions: TransactionDTO[];
    categories: { name: string; icon: string; cents: number }[];
  };
  futureBills: { close: string; totalCents: number }[];
  recurring: { name: string; icon: string; categoryName: string; amountCents: number; nextDate: string }[];
  recurringTotalCents: number;
  installments: {
    name: string;
    icon: string;
    installmentCents: number;
    current: number;
    total: number;
    remainingCents: number;
    lastDate: string;
  }[];
  installmentsRemainingCents: number;
  bills: { id: string; dueDate: string; totalCents: number }[];
}

export interface CardsDTO {
  cards: CardDTO[];
}

export type ConnectionHealth = 'ok' | 'syncing' | 'expiring' | 'expired' | 'error';

export interface ConnectionDTO {
  itemId: string;
  connectorName: string;
  connectorImage: string | null;
  health: ConnectionHealth;
  status: string;
  errorMessage: string | null;
  lastSyncError: string | null;
  consentExpiresAt: string | null;
  lastSyncAt: string | null;
  accounts: { id: string; name: string; type: 'BANK' | 'CREDIT' | 'INVESTMENT' | 'CASH'; balanceCents: number }[];
}

export interface ConnectionsDTO {
  /** false quando PLUGGY_CLIENT_ID/SECRET não estão no .env */
  configured: boolean;
  webhookConfigured: boolean;
  connections: ConnectionDTO[];
}

export interface GoalDTO {
  id: string;
  name: string;
  icon: string;
  targetCents: number;
  deadline: string | null;
  savedCents: number;
  pct: number;
  remainingCents: number;
  monthsLeft: number | null;
  perMonthCents: number | null;
  paceCents: number;
  status: 'done' | 'on-track' | 'behind' | 'no-deadline' | 'late';
  contributions: { id: string; amountCents: number; localDate: string }[];
}

export interface ReportsDTO {
  cashflow: { month: string; incomeCents: number; expenseCents: number }[];
  /** Saldo em conta (corrente + dinheiro) ao fim de cada mês */
  balance: { month: string; balanceCents: number }[];
  liquidCents: number;
  investmentsCents: number;
}

export interface CompareDTO {
  a: string;
  b: string;
  aTotalCents: number;
  bTotalCents: number;
  rows: { id: string; name: string; icon: string; aCents: number; bCents: number; deltaCents: number }[];
}

export type BillStatus = 'pending' | 'overdue' | 'paid';

export interface BillDTO {
  id: string;
  name: string;
  /** null quando o valor varia (ex.: luz) */
  amountCents: number | null;
  dueDay: number | null;
  dueDate: string | null;
  category: CategoryDTO | null;
  /** Dá baixa sozinha quando o pagamento aparece no extrato */
  autoMatch: boolean;
  occurrence: { period: string; dueDate: string; status: BillStatus } | null;
}

export interface BillSuggestionDTO {
  matchKey: string;
  name: string;
  amountCents: number;
  dueDay: number;
  category: CategoryDTO | null;
}

export interface UpcomingDTO {
  /** "bill:<id>" ou "card:<accountId>" */
  key: string;
  kind: 'bill' | 'card';
  name: string;
  amountCents: number | null;
  dueDate: string;
  status: BillStatus;
  icon: string;
  billId?: string;
  period?: string;
}

export interface BillsDTO {
  bills: BillDTO[];
  suggestions: BillSuggestionDTO[];
  upcoming: UpcomingDTO[];
}

export interface NotificationSettingsDTO {
  newTransaction: boolean;
  /** Só avisa transações a partir deste valor (0 = todas) */
  newTransactionMinCents: number;
  budget: boolean;
  billsDue: boolean;
  lowBalance: boolean;
  lowBalanceCents: number;
  unusualSpending: boolean;
  weeklySummary: boolean;
  monthlySummary: boolean;
  syncErrors: boolean;
  /** "HH:MM" no fuso de São Paulo; null = sem horário de silêncio */
  quietStart: string | null;
  quietEnd: string | null;
}

export type BudgetStatus = 'ok' | 'warn' | 'full' | 'over';

export interface BudgetDTO {
  categoryId: string;
  name: string;
  icon: string;
  limitCents: number;
  spentCents: number;
  pct: number;
  status: BudgetStatus;
  projectedCents: number;
}

export interface BudgetsDTO {
  month: string;
  totalLimitCents: number;
  totalSpentCents: number;
  budgets: BudgetDTO[];
  /** Categorias de gasto ainda sem orçamento */
  available: CategoryDTO[];
}
