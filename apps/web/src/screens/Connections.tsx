import type { ConnectionDTO, ConnectionHealth } from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Landmark, Plus, RefreshCw, Trash2, Webhook } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
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

      <PluggyCredentials />

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

interface CredentialsInfo {
  canStore: boolean;
  /** own: do usuário; default: do .env do servidor; null: nenhuma */
  source: 'own' | 'default' | null;
  clientIdHint: string | null;
}

/**
 * Client ID e Client Secret do Meu Pluggy do usuário. Cada conta do Meu Pluggy só enxerga as
 * próprias conexões: quem tem a sua conta cadastra as próprias credenciais aqui.
 */
function PluggyCredentials() {
  const qc = useQueryClient();
  const toast = useToast();
  const sheet = useSheet();
  const info = useQuery({ queryKey: ['pluggy-credentials'], queryFn: () => api<CredentialsInfo>('/pluggy/credentials') });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['pluggy-credentials'] });
    qc.invalidateQueries({ queryKey: ['connections'] });
  };
  const remove = useMutation({
    mutationFn: () => api('/pluggy/credentials', { method: 'DELETE' }),
    onSuccess: () => {
      toast('Credenciais removidas');
      refresh();
    },
  });
  if (!info.data) return null;
  const { source, clientIdHint, canStore } = info.data;

  return (
    <section className="card-lg stack fu" style={{ gap: 12 }} aria-label="Credenciais do Meu Pluggy">
      <div className="row" style={{ gap: 12 }}>
        <span className="tile">
          <KeyRound size={20} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="item-main">
          <span className="item-title">Credenciais do Meu Pluggy</span>
          <span className="item-sub">
            {source === 'own'
              ? `As suas · Client ID ${clientIdHint}`
              : source === 'default'
                ? `Padrão do servidor · Client ID ${clientIdHint}`
                : 'Nenhuma cadastrada'}
          </span>
        </div>
      </div>
      {source !== 'own' && (
        <p className="small muted" style={{ lineHeight: 1.45 }}>
          {source === 'default'
            ? 'Se as suas conexões estão em outra conta do Meu Pluggy, cadastre o Client ID e o Client Secret dela.'
            : 'Para trazer os seus bancos, cadastre o Client ID e o Client Secret da sua conta em meu.pluggy.ai.'}
        </p>
      )}
      {canStore ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="chip row" style={{ gap: 6, height: 44 }} onClick={sheet.open}>
            <KeyRound size={16} strokeWidth={2} aria-hidden="true" />
            {source === 'own' ? 'Trocar credenciais' : 'Cadastrar minhas credenciais'}
          </button>
          {source === 'own' && (
            <button
              type="button"
              className="chip row"
              style={{ gap: 6, height: 44, color: 'var(--danger)' }}
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
              Remover
            </button>
          )}
        </div>
      ) : (
        <p className="small muted">O servidor ainda não está configurado para guardar credenciais (CREDENTIALS_KEY no .env).</p>
      )}
      <CredentialsSheet state={sheet.state} onClose={sheet.close} onSaved={refresh} />
    </section>
  );
}

function CredentialsSheet({ state, onClose, onSaved }: { state: 'closed' | 'open' | 'closing'; onClose: () => void; onSaved: () => void }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => api<{ ok: boolean; webhook: boolean }>('/pluggy/credentials', { method: 'PUT', body: { clientId: clientId.trim(), clientSecret: clientSecret.trim() } }),
    onSuccess: (r) => {
      toast(r.webhook ? 'Credenciais salvas e webhook ativo' : 'Credenciais salvas');
      onSaved();
      onClose();
    },
  });

  useEffect(() => {
    if (state === 'open') {
      setClientId('');
      setClientSecret('');
      save.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const field = { height: 56, borderRadius: 18, border: 0, background: 'var(--fill)', padding: '0 18px', fontSize: 16, outline: 'none' } as const;

  return (
    <Sheet state={state} onClose={onClose} title="Credenciais do Meu Pluggy">
      <ol className="stack small muted" style={{ gap: 8, margin: 0, paddingLeft: 20, lineHeight: 1.45 }}>
        <li>
          Entre em <strong style={{ color: 'var(--ink)' }}>meu.pluggy.ai</strong> com a sua conta.
        </li>
        <li>Copie o Client ID e o Client Secret (área de desenvolvedor / API).</li>
        <li>Cole abaixo. O secret fica guardado cifrado no servidor e não aparece de novo.</li>
      </ol>
      <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
        <label className="visually-hidden" htmlFor="pluggy-client-id">
          Client ID
        </label>
        <input
          id="pluggy-client-id"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Client ID"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          required
          style={field}
        />
        <label className="visually-hidden" htmlFor="pluggy-client-secret">
          Client Secret
        </label>
        <input
          id="pluggy-client-secret"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="Client Secret"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          required
          style={field}
        />
        {save.error && (
          <p className="small" style={{ color: 'var(--danger)' }}>
            {save.error.message}
          </p>
        )}
        <button type="submit" className="btn" disabled={!clientId.trim() || !clientSecret.trim() || save.isPending}>
          {save.isPending ? 'Conferindo na Pluggy…' : 'Salvar'}
        </button>
      </form>
    </Sheet>
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
