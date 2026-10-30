/// <reference lib="webworker" />
import { API_CACHE_NAME, type PushPayload } from '@financas/shared';
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> };

self.skipWaiting();
clientsClaim();

// App shell: abre offline
cleanupOutdatedCaches();
const manifest = self.__WB_MANIFEST;
precacheAndRoute(manifest);
// Em desenvolvimento o precache vem vazio e createHandlerBoundToURL lançaria erro,
// derrubando o SW inteiro (e o push junto)
if (manifest.some((e) => (typeof e === 'string' ? e : e.url) === 'index.html')) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }));
}

// Últimos dados da API ficam em cache para uso offline (o app mostra o aviso "dados offline")
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/'),
  new NetworkFirst({ cacheName: API_CACHE_NAME, networkTimeoutSeconds: 6 }),
);

// iOS exige que toda push exiba uma notificação visível
self.addEventListener('push', (event) => {
  let payload: PushPayload;
  try {
    payload = event.data?.json() as PushPayload;
  } catch {
    payload = { title: 'Kaixa', body: event.data?.text() ?? 'Nova atualização', url: '/' };
  }

  const tasks: Promise<unknown>[] = [
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: payload.url || '/' },
    }),
  ];
  if (typeof payload.badge === 'number' && 'setAppBadge' in self.navigator) {
    tasks.push(payload.badge > 0 ? self.navigator.setAppBadge(payload.badge) : self.navigator.clearAppBadge());
  }
  event.waitUntil(Promise.all(tasks).catch(() => {}));
});

// Deep link: foca o app aberto e navega para a tela da notificação, ou abre uma nova janela
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data?.url as string) ?? '/', self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows[0];
      if (client) {
        await client.focus();
        client.postMessage({ type: 'navigate', url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
