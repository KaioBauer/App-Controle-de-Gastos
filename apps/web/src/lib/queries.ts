import type {
  AnalysisDTO,
  BudgetsDTO,
  CardsDTO,
  CategoryDTO,
  ConnectionsDTO,
  Period,
  SummaryDTO,
  TransactionDTO,
} from '@financas/shared';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

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

export const useTransactions = () =>
  useInfiniteQuery({
    queryKey: ['transactions'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<{ items: TransactionDTO[]; nextCursor: string | null }>(`/transactions${pageParam ? `?cursor=${pageParam}` : ''}`),
    getNextPageParam: (last) => last.nextCursor,
  });

/** Tudo que depende de transações ou orçamentos é recarregado após uma mudança. */
function useInvalidateFinance() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ['summary', 'analysis', 'budgets', 'transactions', 'cards'].map((key) => qc.invalidateQueries({ queryKey: [key] })),
    );
}

export function useCreateTransaction() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (body: { amountCents: number; categoryId: string; kind?: 'expense' | 'income'; description?: string }) =>
      api<TransactionDTO>('/transactions', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (id: string) => api(`/transactions/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
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
