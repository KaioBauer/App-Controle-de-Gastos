import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router';
import { api, ApiError } from './lib/api';
import { isIOS, isStandalone, setBadge } from './lib/platform';
import { syncSubscription } from './lib/push';
import { Analysis } from './screens/Analysis';
import { Bills } from './screens/Bills';
import { Budgets } from './screens/Budgets';
import { Cards } from './screens/Cards';
import { Categories } from './screens/Categories';
import { Connections } from './screens/Connections';
import { Home } from './screens/Home';
import { InstallGuide } from './screens/InstallGuide';
import { NotificationSettings } from './screens/NotificationSettings';
import { Rules } from './screens/Rules';
import { Settings } from './screens/Settings';
import { Transactions } from './screens/Transactions';
import { Welcome } from './screens/Welcome';
import { Dock } from './ui/Dock';

const INSTALL_DISMISSED = 'install-guide-dismissed';

function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<{ username: string }>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: Infinity,
  });
}

/** Deep link vindo do service worker quando o app já está aberto. */
function useServiceWorkerNavigation() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'navigate') return;
      const url = new URL(event.data.url as string);
      navigate(url.pathname + url.search);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
}

/** Mantém o badge do ícone e a inscrição de push em dia sempre que o app volta ao primeiro plano. */
function useForegroundSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const sync = () => {
      if (document.visibilityState !== 'visible') return;
      api<{ count: number }>('/badge')
        .then(({ count }) => setBadge(count))
        .catch(() => {});
      syncSubscription();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [enabled]);
}

/** Cada troca de tela começa do topo, como num app nativo. */
function useScrollTopOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
}

export function App() {
  const me = useMe();
  const [showInstall, setShowInstall] = useState(() => {
    try {
      return isIOS() && !isStandalone() && sessionStorage.getItem(INSTALL_DISMISSED) !== '1';
    } catch {
      return isIOS() && !isStandalone();
    }
  });
  // Sem rede, o /auth/me falha: seguimos com os dados em cache em vez de mandar para o login
  const loggedIn = !!me.data || (me.isError && !(me.error instanceof ApiError));

  useServiceWorkerNavigation();
  useForegroundSync(loggedIn);
  useScrollTopOnNavigate();

  if (showInstall) {
    return (
      <InstallGuide
        onContinue={() => {
          try {
            sessionStorage.setItem(INSTALL_DISMISSED, '1');
          } catch {
            // ignora: o guia volta a aparecer na próxima abertura
          }
          setShowInstall(false);
        }}
      />
    );
  }
  if (me.isPending) return null;
  if (!loggedIn) return <Welcome />;

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cartoes" element={<Cards />} />
        <Route path="/analise" element={<Analysis />} />
        <Route path="/orcamentos" element={<Budgets />} />
        <Route path="/transacoes" element={<Transactions />} />
        <Route path="/contas" element={<Bills />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route path="/ajustes/notificacoes" element={<NotificationSettings />} />
        <Route path="/ajustes/conexoes" element={<Connections />} />
        <Route path="/ajustes/regras" element={<Rules />} />
        <Route path="/ajustes/categorias" element={<Categories />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <Dock />
    </>
  );
}
