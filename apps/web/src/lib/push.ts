import { api } from './api';
import { pushSupported } from './platform';

export type PushState = 'unsupported' | 'denied' | 'default' | 'subscribed' | 'granted-unsubscribed';

function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) return 'subscribed';
  return Notification.permission === 'granted' ? 'granted-unsubscribed' : 'default';
}

/**
 * Pré-carrega o registro do SW e a chave VAPID. Deve ser chamado ANTES do toque,
 * para que `subscribe` rode sem `await` prévio e o iOS reconheça o gesto do usuário.
 */
export async function preparePush(): Promise<{ reg: ServiceWorkerRegistration; key: Uint8Array<ArrayBuffer> }> {
  const [reg, { key }] = await Promise.all([
    navigator.serviceWorker.ready,
    api<{ key: string }>('/push/vapid-public-key'),
  ]);
  return { reg, key: base64UrlToUint8Array(key) };
}

/** Chamar diretamente no handler de clique: o próprio subscribe dispara o pedido de permissão. */
export async function subscribePush(prepared: { reg: ServiceWorkerRegistration; key: Uint8Array<ArrayBuffer> }) {
  const sub = await prepared.reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: prepared.key });
  await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
}

export async function unsubscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api('/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe();
}

/** Reenvia a inscrição atual ao servidor (o endpoint pode mudar após atualização do iOS). */
export async function syncSubscription() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await api('/push/subscribe', { method: 'POST', body: sub.toJSON() }).catch(() => {});
}
