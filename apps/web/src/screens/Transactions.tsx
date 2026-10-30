import type { TransactionDTO } from '@financas/shared';
import { addDays, localDate } from '@financas/shared';
import { useTransactions } from '../lib/queries';
import { OfflineBanner, PageHeader, TxRow } from '../ui/common';

const dayTitle = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

function groupByDay(items: TransactionDTO[]) {
  const groups: { day: string; items: TransactionDTO[] }[] = [];
  for (const t of items) {
    const last = groups.at(-1);
    if (last?.day === t.localDate) last.items.push(t);
    else groups.push({ day: t.localDate, items: [t] });
  }
  return groups;
}

export function Transactions() {
  const q = useTransactions();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const today = localDate(new Date());
  const yesterday = addDays(today, -1);

  const label = (day: string) =>
    day === today ? 'Hoje' : day === yesterday ? 'Ontem' : dayTitle.format(new Date(`${day}T00:00:00Z`));

  return (
    <main className="page">
      <PageHeader title="Movimentações" back="/" />
      <OfflineBanner />

      {q.error && !q.data && <p className="muted">Não foi possível carregar. {q.error.message}</p>}
      {q.data && items.length === 0 && (
        <div className="card-lg empty">
          <span>Nenhuma movimentação ainda.</span>
          <span className="small">Toque em + para lançar um gasto.</span>
        </div>
      )}

      {groupByDay(items).map((g, gi) => (
        <section key={g.day} className="stack" style={{ gap: 10 }} aria-label={label(g.day)}>
          <h2 className="small muted fu" style={{ fontWeight: 500, paddingLeft: 4, textTransform: 'capitalize', animationDelay: `${Math.min(gi, 6) * 40}ms` }}>
            {label(g.day)}
          </h2>
          <div className="list">
            {g.items.map((t, i) => (
              <TxRow
                key={t.id}
                tx={t}
                delay={Math.min(gi * 40 + i * 30, 400)}
                meta={`${t.category?.name ?? 'Sem categoria'} · ${t.accountName} · ${time.format(new Date(t.date))}`}
              />
            ))}
          </div>
        </section>
      ))}

      {q.hasNextPage && (
        <button type="button" className="btn" style={{ background: 'var(--surface)', color: 'var(--ink)' }} onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          {q.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}
    </main>
  );
}
