import type {
  AccountDTO,
  AnalysisDTO,
  BillsDTO,
  BudgetsDTO,
  CardsDTO,
  CategoryDTO,
  CompareDTO,
  ConnectionsDTO,
  NotificationSettingsDTO,
  Period,
  ReportsDTO,
  RuleDTO,
  SummaryDTO,
  TransactionDTO,
  TransactionListDTO,
} from '@financas/shared';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { setBadge } from './platform';

export const useSummary = () => useQuery({ queryKey: ['summary'], queryFn: () => api<SummaryDTO>('/summary') });

export const useAnalysis = (period: Period) =>
  useQuery({
    queryKey: ['analysis', period],
    queryFn: () => api<AnalysisDTO>(`/analysis?period=${period}`),
    // Mantém o período anterior na tela enquanto o novo carrega
    placeholderData: keepPreviousData,
  });

export const useBudgets = () => useQuery({ queryKey: ['budgets'], queryFn: () => api<BudgetsDTO>('/budgets') });

export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryDTO[]>('/categories'), staleTime: 5 * 60_000 });

export interface TxFilters {
  q?: string;
  type?: 'expense' | 'income' | 'transfer';
  unreviewed?: boolean;
  accountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
}

function filterParams(f: TxFilters, cursor: string | null) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.type) p.set('type', f.type);
  if (f.unreviewed) p.set('unreviewed', '1');
  if (f.accountId) p.set('accountId', f.accountId);
  if (f.categoryId) p.set('categoryId', f.categoryId);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (cursor) p.set('cursor', cursor);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const useTransactions = (filters: TxFilters = {}) =>
  useInfiniteQuery({
    queryKey: ['transactions', filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api<TransactionListDTO>(`/transactions${filterParams(filters, pageParam)}`),
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  });

export const useAccounts = () =>
  useQuery({ queryKey: ['accounts'], queryFn: () => api<AccountDTO[]>('/accounts'), staleTime: 5 * 60_000 });

export const useSimilar = (id: string | null) =>
  useQuery({
    queryKey: ['similar', id],
    queryFn: () => api<{ count: number; rule: { id: string; category: CategoryDTO } | null }>(`/transactions/${id}/similar`),
    enabled: !!id,
  });

export const useUnreviewedCount = () =>
  useQuery({ queryKey: ['badge'], queryFn: () => api<{ count: number }>('/badge') });

export const useNotificationSettings = () =>
  useQuery({ queryKey: ['notification-settings'], queryFn: () => api<NotificationSettingsDTO>('/settings/notifications') });

export function useSaveNotificationSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationSettingsDTO) => api<NotificationSettingsDTO>('/settings/notifications', { method: 'PUT', body }),
    // Atualiza na hora (os switches respondem sem esperar o servidor) e desfaz se falhar
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ['notification-settings'] });
      const previous = qc.getQueryData<NotificationSettingsDTO>(['notification-settings']);
      qc.setQueryData(['notification-settings'], next);
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(['notification-settings'], ctx.previous),
    onSuccess: (saved) => qc.setQueryData(['notification-settings'], saved),
  });
}

export const useBills = () => useQuery({ queryKey: ['bills'], queryFn: () => api<BillsDTO>('/bills') });

export interface BillInput {
  name: string;
  amountCents: number | null;
  dueDay: number | null;
  dueDate: string | null;
  categoryId: string | null;
  matchKey?: string | null;
}

export function useSaveBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: BillInput & { id?: string }) =>
      id ? api(`/bills/${id}`, { method: 'PATCH', body }) : api<{ id: string }>('/bills', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bills'] }),
  });
}

export function useBillAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { type: 'pay' | 'unpay' | 'delete'; id: string; period?: string } | { type: 'dismiss'; key: string }) => {
      if (a.type === 'dismiss') return api(`/bills/suggestions/${encodeURIComponent(a.key)}/dismiss`, { method: 'POST' });
      if (a.type === 'pay') return api(`/bills/${a.id}/pay`, { method: 'POST', body: { period: a.period } });
      if (a.type === 'unpay') return api(`/bills/${a.id}/pay/${a.period}`, { method: 'DELETE' });
      return api(`/bills/${a.id}`, { method: 'DELETE' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bills'] }),
  });
}

export const useReports = () => useQuery({ queryKey: ['reports'], queryFn: () => api<ReportsDTO>('/reports') });

export const useCompare = (a: string, b: string) =>
  useQuery({
    queryKey: ['compare', a, b],
    queryFn: () => api<CompareDTO>(`/reports/compare?a=${a}&b=${b}`),
    placeholderData: keepPreviousData,
  });

export const useRules = () => useQuery({ queryKey: ['rules'], queryFn: () => api<RuleDTO[]>('/rules') });

/** Atualiza o número no ícone depois de revisar transações. */
async function refreshBadge() {
  const { count } = await api<{ count: number }>('/badge').catch(() => ({ count: 0 }));
  await setBadge(count);
}

/**
 * Tudo que depende de transações ou orçamentos é recarregado após uma mudança.
 * Roda em segundo plano (sem await): a tela responde na hora em vez de esperar os refetches.
 */
function useInvalidateFinance() {
  const qc = useQueryClient();
  return () => {
    void Promise.all([
      ...['summary', 'analysis', 'budgets', 'transactions', 'cards', 'bill', 'bills', 'similar', 'rules', 'badge', 'reports', 'compare'].map((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      ),
      refreshBadge(),
    ]);
  };
}

export function useCreateTransaction() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (body: { amountCents: number; categoryId: string; kind?: 'expense' | 'income'; description?: string; localDate?: string }) =>
      api<TransactionDTO>('/transactions', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; notes?: string | null; tags?: string[]; reviewed?: boolean; amountCents?: number; kind?: 'expense' | 'income'; description?: string; localDate?: string }) =>
      api<TransactionDTO>(`/transactions/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
}

export function useRecategorize() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; categoryId: string; applyToSimilar: boolean; createRule: boolean }) =>
      api<{ transaction: TransactionDTO; similarUpdated: number; ruleCreated: boolean }>(`/transactions/${id}/recategorize`, {
        method: 'POST',
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useReview() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (body: { ids: string[] } | { all: true }) => api<{ updated: number }>('/transactions/review', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (id: string) => api(`/transactions/${id}`, { method: 'DELETE' }),
    onSuccess: (_r, id) => {
      // A transação não existe mais: não tenta recarregar as "parecidas" dela
      qc.removeQueries({ queryKey: ['similar', id] });
      invalidate();
    },
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });
}

export const useCards = () => useQuery({ queryKey: ['cards'], queryFn: () => api<CardsDTO>('/cards') });

export const useBillTransactions = (billId: string | null) =>
  useQuery({
    queryKey: ['bill', billId],
    queryFn: () => api<{ items: TransactionDTO[] }>(`/cards/bills/${billId}`),
    enabled: !!billId,
  });

export const useConnections = () =>
  useQuery({ queryKey: ['connections'], queryFn: () => api<ConnectionsDTO>('/pluggy/connections') });

/** Mudanças nas conexões trazem contas e transações novas: recarrega tudo. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function useAddConnection() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (itemId: string) =>
      api<{ itemId: string; created?: number; error?: string }>('/pluggy/connections', { method: 'POST', body: { itemId } }),
    onSettled: invalidate,
  });
}

export function useSyncConnection() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (itemId: string) => api<{ created: number }>(`/pluggy/connections/${itemId}/sync`, { method: 'POST' }),
    onSettled: invalidate,
  });
}

export function useRemoveConnection() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (itemId: string) => api(`/pluggy/connections/${itemId}`, { method: 'DELETE' }),
    onSettled: invalidate,
  });
}

export function useRegisterWebhook() {
  return useMutation({ mutationFn: () => api<{ url: string }>('/pluggy/webhook', { method: 'POST' }) });
}

export function useSetBudget() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ categoryId, limitCents }: { categoryId: string; limitCents: number }) =>
      api(`/budgets/${categoryId}`, { method: 'PUT', body: { limitCents } }),
    onSuccess: invalidate,
  });
}

export function useDeleteBudget() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (categoryId: string) => api(`/budgets/${categoryId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
