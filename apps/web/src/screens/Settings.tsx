import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronRight, EyeOff, Landmark, LogOut } from 'lucide-react';
import { Link } from 'react-router';
import { api, clearOfflineData } from '../lib/api';
import { setBadge } from '../lib/platform';
import { usePrivacy } from '../lib/privacy';
import { OfflineBanner, PageHeader, Switch } from '../ui/common';

export function Settings() {
  const qc = useQueryClient();
  const { hidden, toggle } = usePrivacy();

  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSettled: async () => {
      await clearOfflineData();
      await setBadge(0);
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  });

  return (
    <main className="page">
      <PageHeader title="Ajustes" back="/" />
      <OfflineBanner />

      <div className="list fu" style={{ animationDelay: '60ms' }}>
        <Link to="/ajustes/notificacoes" className="item">
          <span className="tile">
            <Bell size={20} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="item-main">
            <span className="item-title">Notificações</span>
            <span className="item-sub">Push, teste e aparelhos</span>
          </span>
          <ChevronRight className="item-chevron" size={20} aria-hidden="true" />
        </Link>
        <Link to="/ajustes/conexoes" className="item">
          <span className="tile">
            <Landmark size={20} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="item-main">
            <span className="item-title">Conexões bancárias</span>
            <span className="item-sub">Meu Pluggy: status e sincronização</span>
          </span>
          <ChevronRight className="item-chevron" size={20} aria-hidden="true" />
        </Link>
      </div>

      <div className="list fu" style={{ animationDelay: '120ms' }}>
        <button type="button" className="item" role="switch" aria-checked={hidden} onClick={toggle}>
          <span className="tile">
            <EyeOff size={20} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="item-main">
            <span className="item-title">Ocultar valores</span>
            <span className="item-sub">Mostra R$ •••• no lugar dos valores</span>
          </span>
          <Switch checked={hidden} />
        </button>
      </div>

      <div className="list fu" style={{ animationDelay: '180ms' }}>
        <button type="button" className="item" onClick={() => logout.mutate()} disabled={logout.isPending}>
          <span className="tile" style={{ color: 'var(--danger)' }}>
            <LogOut size={20} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="item-main">
            <span className="item-title" style={{ color: 'var(--danger)' }}>
              Sair
            </span>
          </span>
        </button>
      </div>
    </main>
  );
}
