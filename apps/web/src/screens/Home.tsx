import { addDays, localDate, localMinutes, monthName } from '@financas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { Link } from 'react-router';
import { Money, useCountUp, usePrivacy } from '../lib/privacy';
import { useSummary, useUnreviewedCount } from '../lib/queries';
import { OfflineBanner, relativeDay, TxRow } from '../ui/common';

function greeting(now: Date) {
  const m = localMinutes(now);
  return m < 12 * 60 ? 'Bom dia,' : m < 18 * 60 ? 'Boa tarde,' : 'Boa noite,';
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Home() {
  const qc = useQueryClient();
  const me = qc.getQueryData<{ username: string }>(['me']);
  const name = capitalize(me?.username ?? '');
  const { hidden, toggle } = usePrivacy();
  const { data, error } = useSummary();
  const unreviewed = useUnreviewedCount().data?.count ?? 0;
  const balance = useCountUp(data?.balanceCents ?? 0);

  // Destaca linhas que surgiram depois do primeiro carregamento (ex.: gasto recém-lançado)
  const seen = useRef<Set<string> | null>(null);
  const newIds = new Set<string>();
  if (data) {
    if (seen.current) for (const t of data.recent) if (!seen.current.has(t.id)) newIds.add(t.id);
    seen.current = new Set(data.recent.map((t) => t.id));
  }

  const now = new Date();
  const today = localDate(now);
  const yesterday = addDays(today, -1);
  const spent = data?.monthSpentCents ?? 0;
  const budget = data?.budgetTotalCents ?? 0;
  // A barra compara só o que é comparável: gasto nas categorias orçadas vs. soma dos limites
  const budgetSpent = data?.budgetSpentCents ?? 0;
  const spentPct = budget > 0 ? Math.min(100, (budgetSpent / budget) * 100) : 0;

  return (
    <main className="page">
      <div className="between fu">
        <Link to="/ajustes" className="row press" style={{ gap: 12 }} aria-label="Ajustes">
          <span className="avatar" aria-hidden="true">
            {name.charAt(0) || 'K'}
          </span>
          <span className="stack" style={{ gap: 2 }}>
            <span className="small muted">{greeting(now)}</span>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{name}</span>
          </span>
        </Link>
        <Link to="/ajustes/notificacoes" className="round-btn press" aria-label="Notificações">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </Link>
      </div>

      <OfflineBanner />

      <section className="hero fu" style={{ animationDelay: '80ms' }} aria-label="Saldo">
        <div className="between">
          <span className="muted" style={{ fontSize: 14 }}>
            Saldo disponível
          </span>
          <span className="tag">{capitalize(monthName(today.slice(0, 7)))}</span>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
          style={{ textAlign: 'left', fontSize: 44, fontWeight: 600, lineHeight: 1 }}
        >
          <Money cents={balance} splitSymbol symbolStyle={{ fontSize: 22, color: 'var(--hero-ink-2)' }} />
        </button>
        <div className="stack" style={{ gap: 10 }}>
          <div className="between small">
            <span className="muted">Gasto do mês</span>
            <Money cents={spent} />
          </div>
          {budget > 0 ? (
            <>
              <div
                className="track"
                role="progressbar"
                aria-label="Gasto nas categorias orçadas em relação ao limite"
                aria-valuenow={Math.round(spentPct)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="gx" style={{ width: `${spentPct}%`, background: budgetSpent > budget ? 'var(--hero-ink)' : undefined }} />
              </div>
              <span className="small muted">
                Orçamentos: <Money cents={budgetSpent} /> de <Money cents={budget} />
              </span>
            </>
          ) : (
            <Link to="/orcamentos" className="small" style={{ color: 'var(--hero-ink-2)', textDecoration: 'underline' }}>
              Defina orçamentos para acompanhar o limite do mês
            </Link>
          )}
        </div>
      </section>

      <div className="fu" style={{ animationDelay: '160ms', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <div className="card stack" style={{ gap: 6 }}>
          <span className="small muted">Entradas</span>
          <Money cents={data?.monthIncomeCents ?? 0} style={{ fontSize: 20, fontWeight: 600 }} />
        </div>
        <div className="card stack" style={{ gap: 6 }}>
          <span className="small muted">{budget > 0 ? 'Restante' : 'Saldo do mês'}</span>
          <Money
            cents={budget > 0 ? Math.max(0, budget - budgetSpent) : (data?.monthIncomeCents ?? 0) - spent}
            sign={budget > 0 ? 'none' : 'auto'}
            style={{ fontSize: 20, fontWeight: 600 }}
          />
        </div>
      </div>

      <div className="section-title fu" style={{ animationDelay: '220ms' }}>
        <h2 className="h2">Movimentações</h2>
        <span className="row" style={{ gap: 12 }}>
          {!!unreviewed && (
            <Link to="/transacoes?unreviewed=1" className="tag" aria-label={`${unreviewed} transações para revisar`}>
              {unreviewed} para revisar
            </Link>
          )}
          <Link to="/transacoes" className="link">
            Ver tudo
          </Link>
        </span>
      </div>

      <div className="list">
        {error && !data ? (
          <p className="empty">Não foi possível carregar. {error.message}</p>
        ) : data && data.recent.length === 0 ? (
          <div className="empty">
            <span>Nenhuma movimentação ainda.</span>
            <span className="small">Toque em + para lançar um gasto.</span>
          </div>
        ) : (
          data?.recent.map((t, i) => (
            <TxRow
              key={t.id}
              tx={t}
              isNew={newIds.has(t.id)}
              delay={260 + i * 60}
              meta={`${t.category?.name ?? t.accountName} · ${relativeDay(t.localDate, t.date, today, yesterday)}`}
            />
          ))
        )}
      </div>
    </main>
  );
}
