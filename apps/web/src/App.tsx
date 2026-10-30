import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Route, Routes, useLocation, useNavigate } from 'react-router';
import { api, ApiError } from './lib/api';
import { isPageUnloading, LOCK_GRACE_MS, LOCKED_EVENT, markUnlocked, sendLock, unlockedThisSession } from './lib/lock';
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
import { LockScreen } from './screens/Lock';
import { NotificationSettings } from './screens/NotificationSettings';
import { Rules } from './screens/Rules';
import { Security } from './screens/Security';
import { Settings } from './screens/Settings';
import { Transactions } from './screens/Transactions';
import { Welcome } from './screens/Welcome';
import { Dock } from './ui/Dock';

const INSTALL_DISMISSED = 'install-guide-dismissed';

interface Me {
  username: string;
  /** Sessão bloqueada no servidor até o Face ID */
  locked?: boolean;
  /** Usuário pediu Face ID ao abrir o app (e tem passkey) */
  appLock?: boolean;
}

function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<Me>('/auth/me');
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

/**
 * Face ID ao abrir e ao voltar para o app. Ao ir para o segundo plano, a tela é coberta na hora
 * (a foto do alternador de apps não mostra valores) e a sessão é bloqueada no servidor; voltar
 * dentro da tolerância desfaz o bloqueio, depois disso só com Face ID ou senha.
 */
function useAppLock(me: Me | null | undefined) {
  const qc = useQueryClient();
  const [covered, setCovered] = useState(false);
  const appLock = !!me?.appLock;
  const locked = !!me?.locked;

  const setLocked = useCallback(
    (value: boolean) => qc.setQueryData<Me | null>(['me'], (m) => (m ? { ...m, locked: value } : m)),
    [qc],
  );

  // Abertura do app: bloqueia, a menos que já tenha sido desbloqueado nesta aba (ex.: recarga por atualização)
  useEffect(() => {
    if (!appLock || locked || unlockedThisSession()) return;
    setLocked(true);
    void sendLock();
  }, [appLock, locked, setLocked]);

  // Qualquer 423 da API (sessão bloqueada em outro momento) mostra a tela de bloqueio
  useEffect(() => {
    const onLocked = () => setLocked(true);
    window.addEventListener(LOCKED_EVENT, onLocked);
    return () => window.removeEventListener(LOCKED_EVENT, onLocked);
  }, [setLocked]);

  useEffect(() => {
    if (!appLock) return;
    let hiddenAt = 0;
    let pendingLock: Promise<void> = Promise.resolve();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (isPageUnloading()) return;
        hiddenAt = Date.now();
        flushSync(() => setCovered(true));
        markUnlocked(false);
        pendingLock = sendLock();
        return;
      }
      if (!hiddenAt) return;
      const quick = Date.now() - hiddenAt <= LOCK_GRACE_MS;
      hiddenAt = 0;
      if (!quick) {
        setLocked(true);
        setCovered(false);
        return;
      }
      // Voltou rápido: desfaz o bloqueio no servidor (que confere a tolerância)
      pendingLock
        .then(() => api<{ locked: boolean }>('/auth/lock/resume', { method: 'POST' }))
        .then(({ locked: still }) => {
          if (!still) markUnlocked(true);
          setLocked(still);
        })
        .catch(() => setLocked(true))
        .finally(() => setCovered(false));
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [appLock, setLocked]);

  const onUnlocked = useCallback(() => {
    markUnlocked(true);
    setLocked(false);
    // Consultas feitas enquanto bloqueado falharam com 423: busca tudo de novo
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  }, [qc, setLocked]);

  return { locked, covered, onUnlocked };
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
  const lock = useAppLock(me.data);

  useServiceWorkerNavigation();
  useForegroundSync(loggedIn && !lock.locked);
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
        <Route path="/ajustes/seguranca" element={<Security />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <Dock />
      {/* O app continua montado por baixo: depois do Face ID, volta exatamente onde estava */}
      {(lock.locked || lock.covered) && <LockScreen cover={!lock.locked} onUnlocked={lock.onUnlocked} />}
    </>
  );
}
