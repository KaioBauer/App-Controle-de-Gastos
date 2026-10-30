/**
 * Mantém o app na versão mais recente.
 *
 * O SW novo faz skipWaiting + clientsClaim, mas a página aberta continua rodando o JS antigo
 * (servido do cache) até ser recarregada. Aqui: quando o SW novo assume, recarrega uma vez;
 * e ao voltar para o primeiro plano (o PWA no iPhone fica aberto por dias) procura atualização.
 */
export function keepAppUpdated() {
  if (!('serviceWorker' in navigator)) return;

  // Na primeira instalação não existe versão antiga para trocar
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.update())
      .catch(() => {
        // Sem rede: tenta de novo na próxima vez que o app voltar ao primeiro plano
      });
  });
}
