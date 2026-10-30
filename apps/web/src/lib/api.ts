import { API_CACHE_NAME } from '@financas/shared';
import { LOCKED_EVENT } from './lock';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  // Sessão bloqueada no servidor: o App mostra a tela do Face ID
  if (res.status === 423) window.dispatchEvent(new Event(LOCKED_EVENT));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Erro ${res.status}`);
  return data as T;
}

/** Remove os dados financeiros guardados no aparelho (usado no logout). */
export async function clearOfflineData() {
  if ('caches' in window) await caches.delete(API_CACHE_NAME);
}
