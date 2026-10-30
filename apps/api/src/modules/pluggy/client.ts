/**
 * Cliente mínimo da API da Pluggy (https://docs.pluggy.ai).
 * Só roda no backend: clientId/clientSecret nunca chegam ao frontend.
 */

const BASE_URL = 'https://api.pluggy.ai';
// A apiKey vale 2h; renovamos com folga
const API_KEY_TTL_MS = 100 * 60 * 1000;
const TIMEOUT_MS = 30_000;

export class PluggyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface PluggyItem {
  id: string;
  status: string;
  executionStatus: string;
  error: { code: string; message: string; providerMessage?: string } | null;
  consentExpiresAt?: string | null;
  lastUpdatedAt?: string | null;
  connector: { id: number; name: string; imageUrl?: string };
}

export interface PluggyAccount {
  id: string;
  itemId: string;
  type: 'BANK' | 'CREDIT';
  subtype: string;
  number: string;
  name: string;
  marketingName: string | null;
  balance: number;
  creditData: {
    creditLimit: number | null;
    availableCreditLimit: number | null;
    balanceCloseDate: string | null;
    balanceDueDate: string | null;
  } | null;
}

export interface PluggyTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  descriptionRaw: string | null;
  type: 'DEBIT' | 'CREDIT';
  /** Na moeda original da compra (pode ser USD) */
  amount: number;
  currencyCode?: string;
  /** Valor convertido para a moeda da conta (BRL) */
  amountInAccountCurrency?: number | null;
  category: string | null;
  status?: 'PENDING' | 'POSTED';
  merchant?: { name?: string; businessName?: string } | null;
  creditCardMetadata: { installmentNumber?: number; totalInstallments?: number; billId?: string; purchaseDate?: string } | null;
}

export interface PluggyBill {
  id: string;
  dueDate: string;
  totalAmount: number;
  minimumPaymentAmount: number | null;
}

export interface PluggyInvestment {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  balance: number;
}

export class PluggyClient {
  private apiKey: { value: string; expiresAt: number } | null = null;
  private pendingAuth: Promise<string> | null = null;

  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {}

  private async auth(): Promise<string> {
    if (this.apiKey && this.apiKey.expiresAt > Date.now()) return this.apiKey.value;
    // Requisições simultâneas compartilham a mesma autenticação
    this.pendingAuth ??= (async () => {
      try {
        const res = await fetch(`${BASE_URL}/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: this.clientId, clientSecret: this.clientSecret }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new PluggyError(res.status, `Falha ao autenticar na Pluggy (${res.status})`);
        const { apiKey } = (await res.json()) as { apiKey: string };
        this.apiKey = { value: apiKey, expiresAt: Date.now() + API_KEY_TTL_MS };
        return apiKey;
      } finally {
        this.pendingAuth = null;
      }
    })();
    return this.pendingAuth;
  }

  private async request<T>(path: string, init: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
    const key = await this.auth();
    const res = await fetch(`${BASE_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: { 'X-API-KEY': key, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // apiKey revogada/expirada antes do previsto: renova uma vez
    if (res.status === 401 && retry) {
      this.apiKey = null;
      return this.request<T>(path, init, false);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new PluggyError(res.status, body?.message ?? `Erro ${res.status} na Pluggy`);
    }
    return (await res.json()) as T;
  }

  getItem(id: string) {
    return this.request<PluggyItem>(`/items/${encodeURIComponent(id)}`);
  }

  async listAccounts(itemId: string) {
    const r = await this.request<{ results: PluggyAccount[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
    return r.results;
  }

  /** Todas as transações da conta a partir de `dateFrom` (cursor de /v2/transactions). */
  async listTransactions(accountId: string, dateFrom: string): Promise<PluggyTransaction[]> {
    const out: PluggyTransaction[] = [];
    // `next` já vem pronto com filtros + cursor; não montamos o cursor manualmente
    let query: string | null = `?accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}`;
    while (query) {
      const page: { results: PluggyTransaction[]; next: string | null } = await this.request(`/v2/transactions${query}`);
      out.push(...page.results);
      query = page.next;
    }
    return out;
  }

  async listBills(accountId: string) {
    const r = await this.request<{ results: PluggyBill[] }>(`/bills?accountId=${encodeURIComponent(accountId)}`);
    return r.results;
  }

  async listInvestments(itemId: string) {
    const r = await this.request<{ results: PluggyInvestment[] }>(`/investments?itemId=${encodeURIComponent(itemId)}`);
    return r.results;
  }

  createWebhook(url: string, headers: Record<string, string>) {
    return this.request<{ id: string }>('/webhooks', { method: 'POST', body: { event: 'all', url, headers } });
  }

  listWebhooks() {
    return this.request<{ results: { id: string; url: string; event: string }[] }>('/webhooks');
  }

  deleteWebhook(id: string) {
    return this.request(`/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}
