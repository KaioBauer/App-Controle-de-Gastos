import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScanFace, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { markUnlocked } from '../lib/lock';
import { passkeysSupported, registerPasskey } from '../lib/passkey';
import { OfflineBanner, PageHeader, Switch } from '../ui/common';
import { useToast } from '../ui/Toast';

interface PasskeyInfo {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

/** Passkeys (Face ID) do usuário. A senha continua valendo como alternativa. */
export function Security() {
  const qc = useQueryClient();
  const toast = useToast();
  const keys = useQuery({ queryKey: ['passkeys'], queryFn: () => api<PasskeyInfo[]>('/auth/passkeys') });
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<{ username: string; appLock?: boolean }>('/auth/me') });
  // Quem está nesta tela já está desbloqueado: ligar o bloqueio não deve pedir o Face ID agora
  const refreshLock = () => {
    markUnlocked(true);
    qc.invalidateQueries({ queryKey: ['me'] });
  };
  const add = useMutation({
    mutationFn: registerPasskey,
    onSuccess: () => {
      toast('Face ID cadastrado neste aparelho');
      qc.invalidateQueries({ queryKey: ['passkeys'] });
      refreshLock();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/auth/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Passkey removida');
      qc.invalidateQueries({ queryKey: ['passkeys'] });
      refreshLock();
    },
  });
  const appLock = !!me.data?.appLock;
  const toggleLock = useMutation({
    mutationFn: (enabled: boolean) => api('/auth/app-lock', { method: 'PUT', body: { enabled } }),
    onSuccess: (_, enabled) => {
      toast(enabled ? 'Face ID será pedido ao abrir o app' : 'Bloqueio com Face ID desligado');
      refreshLock();
    },
    onError: (e) => toast(e.message),
  });
  const hasKeys = !!keys.data && keys.data.length > 0;

  return (
    <main className="page">
      <PageHeader title="Segurança" back="/ajustes" subtitle="Entre com Face ID em vez de digitar a senha." />
      <OfflineBanner />

      {!passkeysSupported() ? (
        <div className="card-lg empty">Este navegador não suporta passkeys.</div>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <button type="button" className="btn" onClick={() => add.mutate()} disabled={add.isPending}>
            <ScanFace size={20} strokeWidth={1.8} aria-hidden="true" />
            {add.isPending ? 'Aguardando Face ID…' : 'Cadastrar Face ID neste aparelho'}
          </button>
          {add.error && (
            <p className="small" style={{ color: 'var(--danger)', padding: '0 8px' }}>
              {add.error.message}
            </p>
          )}
        </div>
      )}

      {hasKeys && (
        <div className="list fu">
          <button
            type="button"
            className="item"
            role="switch"
            aria-checked={appLock}
            disabled={toggleLock.isPending || me.isPending}
            onClick={() => toggleLock.mutate(!appLock)}
          >
            <span className="item-main">
              <span className="item-title">Pedir Face ID ao abrir</span>
              <span className="item-sub">Toda vez que você abre ou volta para o app. Saídas de até 3 segundos não contam.</span>
            </span>
            <Switch checked={appLock} />
          </button>
        </div>
      )}

      {hasKeys && (
        <section className="stack" style={{ gap: 10 }}>
          <h2 className="small muted" style={{ fontWeight: 500, paddingLeft: 4 }}>
            Passkeys cadastradas
          </h2>
          <div className="list fu">
            {keys.data.map((k) => (
              <div key={k.id} className="item">
                <span className="tile">
                  <ScanFace size={20} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="item-main">
                  <span className="item-title">{k.deviceName}</span>
                  <span className="item-sub">
                    Cadastrada em {dateFmt.format(new Date(k.createdAt))}
                    {k.lastUsedAt ? ` · último uso ${dateFmt.format(new Date(k.lastUsedAt))}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className="round-btn press"
                  style={{ background: 'var(--fill)', color: 'var(--danger)' }}
                  aria-label={`Remover passkey de ${k.deviceName}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(k.id)}
                >
                  <Trash2 size={18} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="small muted" style={{ padding: '0 8px', lineHeight: 1.45 }}>
        A passkey fica guardada no Chaves do iCloud e funciona nos seus aparelhos Apple. A senha continua valendo; para trocá-la, use o comando
        create-user no servidor.
      </p>
    </main>
  );
}
