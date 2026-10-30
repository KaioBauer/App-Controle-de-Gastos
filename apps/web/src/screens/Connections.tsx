import type { ConnectionDTO, ConnectionHealth } from '@financas/shared';
import { Landmark, Plus, RefreshCw, Trash2, Webhook } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Money } from '../lib/privacy';
import { useAddConnection, useConnections, useRegisterWebhook, useRemoveConnection, useSyncConnection } from '../lib/queries';
import { OfflineBanner, PageHeader } from '../ui/common';
import { Sheet, useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

const HEALTH: Record<ConnectionHealth, { label: string; cls: string }> = {
  ok: { label: 'Conectado', cls: '' },
  syncing: { label: 'Sincronizando', cls: 'tag-muted' },
  expiring: { label: 'Renovar em breve', cls: 'tag-strong' },
  expired: { label: 'Consentimento expirado', cls: 'tag-strong' },
  error: { label: 'Erro', cls: 'tag-strong' },
};

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const dateOnly = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Sao_Paulo' });

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function Note({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <p className="small" style={{ padding: '0 8px', color: danger ? 'var(--danger)' : 'var(--ink-2)', lineHeight: 1.45 }}>
      {children}
    </p>
  );
}

export function Connections() {
  const { data, error } = useConnections();
  const addSheet = useSheet();
  const removeSheet = useSheet();
  const [removing, setRemoving] = useState<ConnectionDTO | null>(null);
  const sync = useSyncConnection();
  const webhook = useRegisterWebhook();
  const toast = useToast();

  return (
    <main className="page">
      <PageHeader title="Conexões" back="/ajustes" subtitle="Bancos conectados pelo Meu Pluggy" />
      <OfflineBanner />

      {error && !data && <p className="muted">Não foi possível carregar. {error.message}</p>}

      {data && !data.configured && (
        <div className="card-lg empty">
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Pluggy não configurada</span>
          <span className="small">Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env do servidor.</span>
        </div>
      )}

      {data?.configured && data.connections.length === 0 && (
        <div className="card-lg empty fu">
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Nenhum banco conectado</span>
          <span className="small">Conecte seus bancos em meu.pluggy.ai e adicione aqui o ID de cada conexão.</span>
        </div>
      )}

      {data?.connections.map((c, i) => {
        const h = HEALTH[c.health];
        const expiresIn = c.consentExpiresAt ? daysUntil(c.consentExpiresAt) : null;
        const syncingThis = sync.isPending && sync.variables === c.itemId;
        return (
          <section key={c.itemId} className="card-lg stack fu" style={{ gap: 14, animationDelay: `${i * 70}ms` }} aria-label={c.connectorName}>
            <div className="row" style={{ gap: 12 }}>
              {c.connectorImage ? (
                <img src={c.connectorImage} alt="" width={44} height={44} style={{ borderRadius: 14, background: '#fff', objectFit: 'contain', flexShrink: 0 }} />
              ) : (
                <span className="tile">
                  <Landmark size={20} strokeWidth={1.8} aria-hidden="true" />
                </span>
              )}
              <div className="item-main">
                <span className="item-title">{c.connectorName}</span>
                <span className="item-sub">{c.lastSyncAt ? `Sincronizado ${dateTime.format(new Date(c.lastSyncAt))}` : 'Ainda não sincronizado'}</span>
              </div>
              <span className={`tag ${h.cls}`}>{h.label}</span>
            </div>

            {(c.health === 'expiring' || c.health === 'expired') && c.consentExpiresAt && (
              <p className="small" style={{ lineHeight: 1.45 }}>
                {c.health === 'expired' ? 'O consentimento expirou em ' : `O consentimento expira em ${expiresIn} ${expiresIn === 1 ? 'dia' : 'dias'} (`}
                {dateOnly.format(new Date(c.consentExpiresAt))}
                {c.health === 'expired' ? '.' : ').'} Renove em <strong>meu.pluggy.ai</strong> para continuar recebendo os dados.
              </p>
            )}
            {c.health === 'error' && (
              <p className="small" style={{ color: 'var(--danger)', lineHeight: 1.45 }}>
                {c.errorMessage ?? c.lastSyncError ?? 'A conexão precisa de atenção no Meu Pluggy.'}
              </p>
            )}

            {c.accounts.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                {c.accounts.map((a) => (
                  <div key={a.id} className="between small">
                    <span className="muted">
                      {a.name}
                      {a.type === 'CREDIT' ? ' · fatura' : ''}
                    </span>
                    <Money cents={a.balanceCents} />
                  </div>
                ))}
              </div>
            )}

            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="chip row"
                style={{ gap: 6, height: 44 }}
                disabled={syncingThis}
                onClick={() =>
                  sync.mutate(c.itemId, {
                    onSuccess: (r) => toast(r.created ? `${r.created} transações novas` : 'Tudo em dia'),
                    onError: (e) => toast(`Erro: ${e.message}`),
                  })
                }
              >
                <RefreshCw size={16} strokeWidth={2} aria-hidden="true" style={syncingThis ? { animation: 'spin 1s linear infinite' } : undefined} />
                {syncingThis ? 'Sincronizando…' : 'Sincronizar'}
              </button>
              <button
                type="button"
                className="chip row"
                style={{ gap: 6, height: 44, color: 'var(--danger)' }}
                onClick={() => {
                  setRemoving(c);
                  removeSheet.open();
                }}
              >
                <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                Remover
              </button>
            </div>
          </section>
        );
      })}

      {data?.configured && (
        <button type="button" className="btn fu" onClick={addSheet.open}>
          <Plus size={20} strokeWidth={2} aria-hidden="true" />
          Adicionar conexão
        </button>
      )}

      {data?.configured && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="list">
            <button
              type="button"
              className="item"
              disabled={webhook.isPending || !data.webhookConfigured}
              onClick={() =>
                webhook.mutate(undefined, {
                  onSuccess: () => toast('Webhook registrado na Pluggy'),
                })
              }
            >
              <span className="tile">
                <Webhook size={20} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="item-main">
                <span className="item-title">{webhook.isPending ? 'Registrando…' : 'Registrar webhook'}</span>
                <span className="item-sub">Atualizações em tempo real (só no servidor com HTTPS)</span>
              </span>
            </button>
          </div>
          {webhook.error ? (
            <Note danger>{webhook.error.message}</Note>
          ) : webhook.data ? (
            <Note>Webhook ativo em {webhook.data.url}</Note>
          ) : !data.webhookConfigured ? (
            <Note>Defina PLUGGY_WEBHOOK_SECRET no .env para ativar. Enquanto isso, o app sincroniza sozinho a cada hora.</Note>
          ) : (
            <Note>Sem webhook, o app sincroniza sozinho a cada hora.</Note>
          )}
        </div>
      )}

      <AddConnectionSheet state={addSheet.state} onClose={addSheet.close} />

      <Sheet state={removeSheet.state} onClose={removeSheet.close} title="Remover conexão?">
        <RemoveConnection connection={removing} onDone={removeSheet.close} />
      </Sheet>
    </main>
  );
}

function RemoveConnection({ connection, onDone }: { connection: ConnectionDTO | null; onDone: () => void }) {
  const remove = useRemoveConnection();
  const toast = useToast();
  if (!connection) return null;
  return (
    <>
      <p style={{ lineHeight: 1.5 }} className="muted">
        As contas e transações de <strong style={{ color: 'var(--ink)' }}>{connection.connectorName}</strong> serão apagadas deste app. A
        conexão continua no Meu Pluggy e pode ser adicionada de novo depois.
      </p>
      <div className="stack" style={{ gap: 4 }}>
        <button
          type="button"
          className="btn"
          style={{ background: 'var(--danger)', color: '#fff' }}
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(connection.itemId, {
              onSuccess: () => {
                toast(`${connection.connectorName} removido`);
                onDone();
              },
            })
          }
        >
          {remove.isPending ? 'Removendo…' : 'Remover conexão'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </>
  );
}

function AddConnectionSheet({ state, onClose }: { state: 'closed' | 'open' | 'closing'; onClose: () => void }) {
  const [itemId, setItemId] = useState('');
  const add = useAddConnection();
  const toast = useToast();

  useEffect(() => {
    if (state === 'open') {
      setItemId('');
      add.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate(itemId.trim(), {
      onSuccess: (r) => {
        toast(r.error ? 'Conexão salva, mas o sync falhou' : 'Conexão adicionada');
        onClose();
      },
    });
  };

  return (
    <Sheet state={state} onClose={onClose} title="Adicionar conexão">
      <ol className="stack small muted" style={{ gap: 8, margin: 0, paddingLeft: 20, lineHeight: 1.45 }}>
        <li>
          Em <strong style={{ color: 'var(--ink)' }}>meu.pluggy.ai</strong>, conecte o banco (Nubank, Itaú…).
        </li>
        <li>Abra a conexão e copie o ID dela (um código no formato 0a1b2c3d-…).</li>
        <li>Cole abaixo. A primeira sincronização traz até 12 meses de histórico.</li>
      </ol>
      <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
        <label className="visually-hidden" htmlFor="item-id">
          ID da conexão
        </label>
        <input
          id="item-id"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          placeholder="ID da conexão (itemId)"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          style={{ height: 56, borderRadius: 18, border: 0, background: 'var(--fill)', padding: '0 18px', fontSize: 16, outline: 'none' }}
        />
        {add.error && (
          <p className="small" style={{ color: 'var(--danger)' }}>
            {add.error.message}
          </p>
        )}
        <button type="submit" className="btn" disabled={!itemId.trim() || add.isPending}>
          {add.isPending ? 'Conectando e sincronizando…' : 'Adicionar'}
        </button>
      </form>
    </Sheet>
  );
}
