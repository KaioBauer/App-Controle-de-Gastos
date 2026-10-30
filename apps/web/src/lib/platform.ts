import { useSyncExternalStore } from 'react';

/** App aberto pela Tela de Início (modo standalone). Web push no iOS só funciona assim. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  // iPadOS se identifica como Mac, mas tem touch
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}

/** Atualiza o número no ícone do app (Badging API), onde houver suporte. */
export async function setBadge(count: number) {
  try {
    if (!('setAppBadge' in navigator)) return;
    if (count > 0) await navigator.setAppBadge(count);
    else await navigator.clearAppBadge();
  } catch {
    // Sem permissão de notificação o iOS rejeita; não é um erro para o usuário
  }
}
