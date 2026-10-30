import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronRight, EyeOff, Landmark, LogOut, Wand2 } from 'lucide-react';
import { Link } from 'react-router';
import { api, clearOfflineData } from '../lib/api';
import { setBadge } from '../lib/platform';
import { usePrivacy } from '../lib/privacy';
import { OfflineBanner, PageHeader, Switch } from '../ui/common';

const buildDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export function Settings() {
  const qc = useQueryClient();
  const { hidden, toggle } = usePrivacy();

  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSettled: async () => {
      // Primeiro a tela vai para o login; qc.clear() antes descartaria a consulta que o App observa
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      await clearOfflineData();
      await setBadge(0);
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

      <div className="list fu" style={{ animationDelay: '90ms' }}>
        <Link to="/ajustes/regras" className="item">
          <span className="tile">
            <Wand2 size={20} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="item-main">
            <span className="item-title">Regras de categoria</span>
            <span className="item-sub">Categorias automáticas por estabelecimento</span>
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
      <p className="small muted" style={{ textAlign: 'center' }}>
        Kaixa · versão de {buildDate.format(new Date(__APP_BUILD__))}
      </p>
    </main>
  );
}
