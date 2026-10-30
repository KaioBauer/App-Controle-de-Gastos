import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ScanFace } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, clearOfflineData } from '../lib/api';
import { unlockWithPasskey } from '../lib/passkey';
import { setBadge } from '../lib/platform';
import { Brand } from './Welcome';

/**
 * Tela de bloqueio por cima do app. `cover` só esconde o conteúdo enquanto o app está no
 * segundo plano (a foto do alternador de apps não mostra valores).
 */
export function LockScreen({ cover = false, onUnlocked }: { cover?: boolean; onUnlocked: () => void }) {
  const qc = useQueryClient();
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');

  const faceId = useMutation({ mutationFn: unlockWithPasskey, onSuccess: onUnlocked });
  const byPassword = useMutation({
    mutationFn: () => api('/auth/unlock/password', { method: 'POST', body: { password } }),
    onSuccess: onUnlocked,
  });
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSettled: async () => {
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      await clearOfflineData();
      await setBadge(0);
    },
  });

  // Tenta o Face ID assim que a tela aparece; se o iOS exigir um toque, fica o botão
  const tried = useRef(false);
  useEffect(() => {
    if (cover || tried.current) return;
    tried.current = true;
    faceId.mutate(undefined, { onError: () => faceId.reset() });
  }, [cover, faceId]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    byPassword.mutate();
  };
  const error = byPassword.error ?? faceId.error;

  return (
    <div className="dark-screen lock-screen" role="dialog" aria-modal="true" aria-label="Kaixa bloqueado">
      <div className="dark-screen-inner">
        <Brand />
        <div style={{ flex: 1, minHeight: 48 }} />
        {!cover && (
          <div className="stack fu" style={{ gap: 14 }}>
            <div className="stack" style={{ gap: 8, marginBottom: 14 }}>
              <h1 style={{ fontSize: 34, lineHeight: 1.1, fontWeight: 600, letterSpacing: '-0.03em' }}>Kaixa bloqueado.</h1>
              <p style={{ fontSize: 16, color: '#A3A8B0' }}>
                {usePassword ? 'Digite sua senha para continuar.' : 'Use o Face ID para ver suas finanças.'}
              </p>
            </div>

            {usePassword ? (
              <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
                <label className="visually-hidden" htmlFor="unlock-password">
                  Senha
                </label>
                <input
                  id="unlock-password"
                  className="field"
                  type="password"
                  placeholder="Senha"
                  autoComplete="current-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                {error && (
                  <p role="alert" style={{ fontSize: 14, color: '#FF8A7E' }}>
                    {error.message}
                  </p>
                )}
                <button className="btn" type="submit" disabled={byPassword.isPending}>
                  {byPassword.isPending ? 'Desbloqueando…' : 'Desbloquear'}
                </button>
                <button type="button" className="btn btn-ghost row" style={{ gap: 8 }} onClick={() => setUsePassword(false)}>
                  <ScanFace size={20} strokeWidth={1.8} aria-hidden="true" />
                  Usar Face ID
                </button>
              </form>
            ) : (
              <>
                {error && (
                  <p role="alert" style={{ fontSize: 14, color: '#FF8A7E' }}>
                    {error.message}
                  </p>
                )}
                <button type="button" className="btn row" style={{ gap: 8 }} onClick={() => faceId.mutate()} disabled={faceId.isPending}>
                  <ScanFace size={20} strokeWidth={1.8} aria-hidden="true" />
                  {faceId.isPending ? 'Aguardando Face ID…' : 'Desbloquear com Face ID'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setUsePassword(true)}>
                  Usar senha
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              style={{ fontSize: 14, color: '#A3A8B0', padding: '12px 0', alignSelf: 'center' }}
            >
              Sair da conta
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
