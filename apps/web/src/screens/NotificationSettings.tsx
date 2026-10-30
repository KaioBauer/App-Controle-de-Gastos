import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, BellRing, Send, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { isIOS, isStandalone } from '../lib/platform';
import { getPushState, preparePush, subscribePush, unsubscribePush, type PushState } from '../lib/push';
import { PageHeader } from '../ui/common';

const STATE_LABEL: Record<PushState, string> = {
  unsupported: 'Não suportado',
  unavailable: 'Indisponível',
  denied: 'Bloqueadas',
  default: 'Desativadas',
  'granted-unsubscribed': 'Desativadas',
  subscribed: 'Ativas',
};

interface Device {
  endpoint: string;
  userAgent: string | null;
  createdAt: string;
  lastSuccessAt: string | null;
  lastError: string | null;
}

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const BLOCKED_HINT = 'Ative em Ajustes do iPhone › Notificações › Kaixa.';

function deviceName(ua: string | null) {
  if (!ua) return 'Aparelho';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac OS/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Navegador';
}

function Note({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return (
    <p className="small" style={{ padding: '0 8px', color: danger ? 'var(--danger)' : 'var(--ink-2)', lineHeight: 1.45 }}>
      {children}
    </p>
  );
}

export function NotificationSettings() {
  const qc = useQueryClient();
  const [state, setState] = useState<PushState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prepared = useRef<Awaited<ReturnType<typeof preparePush>> | null>(null);
  const needsInstall = isIOS() && !isStandalone();

  const refresh = () => getPushState().then(setState);

  useEffect(() => {
    refresh();
    if (!needsInstall) {
      preparePush()
        .then((p) => (prepared.current = p))
        .catch(() => setError('Não foi possível preparar as notificações. Verifique a conexão.'));
    }
  }, [needsInstall]);

  const devices = useQuery({ queryKey: ['push-status'], queryFn: () => api<{ subscriptions: Device[] }>('/push/status') });
  const refreshAll = () => {
    refresh();
    qc.invalidateQueries({ queryKey: ['push-status'] });
  };

  // Sem `await` antes do subscribe: o iOS só mostra o pedido de permissão dentro do gesto do usuário
  const enable = () => {
    setError(null);
    if (!prepared.current) {
      setError('Ainda carregando, tente de novo em instantes.');
      return;
    }
    subscribePush(prepared.current)
      .catch((e: Error) => setError(Notification.permission === 'denied' ? `Permissão negada. ${BLOCKED_HINT}` : e.message))
      .finally(refreshAll);
  };

  const disable = useMutation({ mutationFn: unsubscribePush, onSettled: refreshAll });
  const test = useMutation({
    mutationFn: () => api<{ sent: number; removed: number; failed: number }>('/push/test', { method: 'POST' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['push-status'] }),
  });

  const canEnable = (state === 'default' || state === 'granted-unsubscribed') && !needsInstall;

  return (
    <main className="page">
      <PageHeader title="Notificações" back="/ajustes" />

      {needsInstall && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="list">
            <div className="item">
              <span className="tile tile-accent">
                <Smartphone size={20} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="item-main">
                <span className="item-title">Instale o app primeiro</span>
                <span className="item-sub">Compartilhar › Adicionar à Tela de Início</span>
              </span>
            </div>
          </div>
          <Note>No iPhone, as notificações só funcionam com o app aberto pelo ícone da Tela de Início.</Note>
        </div>
      )}

      <div className="stack" style={{ gap: 8 }}>
        <div className="list fu">
          <div className="item">
            <span className="item-main">
              <span className="item-title">Este aparelho</span>
            </span>
            <span className={`tag ${state === 'subscribed' ? '' : 'tag-muted'}`}>{state ? STATE_LABEL[state] : '…'}</span>
          </div>
          {canEnable && (
            <button type="button" className="item" onClick={enable}>
              <span className="tile tile-accent">
                <BellRing size={20} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="item-main">
                <span className="item-title">Ativar notificações</span>
              </span>
            </button>
          )}
          {state === 'subscribed' && (
            <button type="button" className="item" onClick={() => disable.mutate()} disabled={disable.isPending}>
              <span className="tile">
                <BellOff size={20} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="item-main">
                <span className="item-title" style={{ color: 'var(--danger)' }}>
                  Desativar neste aparelho
                </span>
              </span>
            </button>
          )}
        </div>
        {error ? (
          <Note danger>{error}</Note>
        ) : state === 'denied' ? (
          <Note>As notificações foram bloqueadas. {BLOCKED_HINT}</Note>
        ) : state === 'unsupported' ? (
          <Note>Este navegador não suporta notificações push. No iPhone é preciso iOS 16.4 ou superior.</Note>
        ) : state === 'unavailable' ? (
          <Note>O app não terminou de carregar o serviço de notificações. Feche e abra o app de novo.</Note>
        ) : null}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="list fu" style={{ animationDelay: '60ms' }}>
          <button type="button" className="item" onClick={() => test.mutate()} disabled={test.isPending}>
            <span className="tile">
              <Send size={20} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="item-main">
              <span className="item-title">{test.isPending ? 'Enviando…' : 'Enviar notificação de teste'}</span>
            </span>
          </button>
        </div>
        {test.data ? (
          <Note>
            {test.data.sent > 0
              ? `Enviada para ${test.data.sent} aparelho(s).${test.data.failed ? ` ${test.data.failed} falhou.` : ''}`
              : 'Nenhum aparelho com notificações ativas.'}
          </Note>
        ) : test.error ? (
          <Note danger>{test.error.message}</Note>
        ) : (
          <Note>Envia para todos os aparelhos ativos. Ao tocar na notificação, o app abre nesta tela.</Note>
        )}
      </div>

      {devices.data && devices.data.subscriptions.length > 0 && (
        <section className="stack" style={{ gap: 10 }}>
          <h2 className="small muted" style={{ fontWeight: 500, paddingLeft: 4 }}>
            Aparelhos inscritos
          </h2>
          <div className="list">
            {devices.data.subscriptions.map((d) => (
              <div key={d.endpoint} className="item">
                <span className="item-main">
                  <span className="item-title">{deviceName(d.userAgent)}</span>
                  <span className="item-sub">
                    {d.lastError
                      ? `Erro: ${d.lastError.slice(0, 60)}`
                      : d.lastSuccessAt
                        ? `Última entrega: ${dateTime.format(new Date(d.lastSuccessAt))}`
                        : `Inscrito em ${dateTime.format(new Date(d.createdAt))}`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Note>Tipos de notificação, valor mínimo e horário de silêncio chegam na etapa de notificações.</Note>
    </main>
  );
}
