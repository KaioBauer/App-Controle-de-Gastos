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

/** Altura da barra de status dos iPhones com ilha dinâmica (a maior entre os modelos atuais). */
const STATUS_BAR_FALLBACK_PX = 54;

/**
 * No app instalado, o iOS desenha a página por baixo da barra de status, mas em algumas versões
 * informa `safe-area-inset-top` = 0: o conteúdo do topo fica embaixo do relógio/ilha (e do
 * desfoque que o iOS aplica ali). Quando a página ocupa a tela inteira e o inset veio zerado,
 * reserva a altura da barra de status.
 */
export function fixStandaloneSafeArea() {
  if (!isIOS() || !isStandalone()) return;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px)';
  document.body.appendChild(probe);
  const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  const underStatusBar = window.innerHeight >= window.screen.height - 1;
  if (inset === 0 && underStatusBar) {
    document.documentElement.style.setProperty('--safe-top', `${STATUS_BAR_FALLBACK_PX}px`);
  }
}
