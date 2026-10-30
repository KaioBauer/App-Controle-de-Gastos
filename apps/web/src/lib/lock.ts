/**
 * Bloqueio do app com Face ID: a sessão é bloqueada no servidor quando o app vai para o
 * segundo plano, e só volta a liberar dados depois do Face ID (ou da senha).
 */

/** Disparado pelo cliente da API quando o servidor responde 423 (sessão bloqueada). */
export const LOCKED_EVENT = 'kaixa:locked';

/** Volta rápida (central de notificações, compartilhar) não pede o Face ID. Igual ao da API. */
export const LOCK_GRACE_MS = 3000;

const UNLOCKED_KEY = 'kaixa-unlocked';

/**
 * Lembra que o app já foi desbloqueado nesta aba: uma recarga (ex.: atualização do app)
 * não pede o Face ID de novo. Sair para o segundo plano apaga a marca.
 */
export function markUnlocked(unlocked: boolean) {
  try {
    if (unlocked) sessionStorage.setItem(UNLOCKED_KEY, '1');
    else sessionStorage.removeItem(UNLOCKED_KEY);
  } catch {
    // sem armazenamento: o Face ID é pedido também depois de uma recarga
  }
}

export function unlockedThisSession() {
  try {
    return sessionStorage.getItem(UNLOCKED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Recarregar a página também esconde o app por um instante (visibilitychange). Numa recarga
 * (atualização do app, F5) não bloqueia: a aba continua a mesma e a marca acima segue valendo.
 */
let pageUnloading = false;
export function markPageUnloading() {
  pageUnloading = true;
}
export const isPageUnloading = () => pageUnloading;
if (typeof window !== 'undefined') window.addEventListener('beforeunload', markPageUnloading);

/** Bloqueia a sessão no servidor. `keepalive` deixa o pedido sair mesmo com o app indo para o fundo. */
export function sendLock(): Promise<void> {
  return fetch('/api/auth/lock', { method: 'POST', credentials: 'same-origin', keepalive: true }).then(
    () => undefined,
    () => undefined,
  );
}

/**
 * Esconde todo o conteúdo do app (inclusive folhas abertas), deixando só a tela de bloqueio.
 * Mexe direto no DOM para valer na hora, antes do iPhone tirar a foto do alternador de apps.
 */
export function hideAppContent(hidden: boolean) {
  document.documentElement.classList.toggle('app-locked', hidden);
}
