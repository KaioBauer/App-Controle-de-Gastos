import type { TransactionDTO } from '@financas/shared';
import { addDays, addMonths, daysInMonth, localDate } from '@financas/shared';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Money } from '../lib/privacy';
import { useAccounts, useCategories, useReview, useTransactions, type TxFilters } from '../lib/queries';
import { OfflineBanner, PageHeader, TxRow } from '../ui/common';
import { Sheet, useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

const dayTitle = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

const TYPES = [
  { id: undefined, label: 'Todas' },
  { id: 'expense', label: 'Gastos' },
  { id: 'income', label: 'Entradas' },
  { id: 'transfer', label: 'Transferências' },
] as const;

type PeriodId = 'all' | 'month' | 'last-month' | '90d';
const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'month', label: 'Este mês' },
  { id: 'last-month', label: 'Mês passado' },
  { id: '90d', label: 'Últimos 90 dias' },
];

function periodRange(id: PeriodId, today: string): { from?: string; to?: string } {
  const ym = today.slice(0, 7);
  if (id === 'month') return { from: `${ym}-01` };
  if (id === 'last-month') {
    const prev = addMonths(ym, -1);
    return { from: `${prev}-01`, to: `${prev}-${String(daysInMonth(prev)).padStart(2, '0')}` };
  }
  if (id === '90d') return { from: addDays(today, -90) };
  return {};
}

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
  const [params, setParams] = useSearchParams();
  const today = localDate(new Date());
  const yesterday = addDays(today, -1);

  const type = (params.get('type') ?? undefined) as TxFilters['type'];
  const unreviewed = params.get('unreviewed') === '1';
  const period = (params.get('period') ?? 'all') as PeriodId;
  const accountId = params.get('accountId') ?? undefined;
  const categoryId = params.get('categoryId') ?? undefined;
  const qParam = params.get('q') ?? '';

  // Busca com atraso para não consultar a cada tecla
  const [search, setSearch] = useState(qParam);
  useEffect(() => {
    const t = setTimeout(() => setParam('q', search.trim() || null), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function setParam(key: string, value: string | null) {
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  const filters: TxFilters = useMemo(
    () => ({ q: qParam || undefined, type, unreviewed, accountId, categoryId, ...periodRange(period, today) }),
    [qParam, type, unreviewed, accountId, categoryId, period, today],
  );
  const q = useTransactions(filters);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const totals = q.data?.pages[0]?.totals;

  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const filterSheet = useSheet();
  const review = useReview();
  const toast = useToast();

  const extraFilters = [period !== 'all', !!accountId, !!categoryId].filter(Boolean).length;
  // "terça-feira, 27 de outubro" -> "Terça-feira, 27 de outubro" (só a primeira letra)
  const label = (day: string) => {
    if (day === today) return 'Hoje';
    if (day === yesterday) return 'Ontem';
    const s = dayTitle.format(new Date(`${day}T00:00:00Z`));
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  return (
    <main className="page">
      <PageHeader title="Movimentações" back="/" />
      <OfflineBanner />

      <div className="search fu">
        <Search size={18} aria-hidden="true" />
        <label className="visually-hidden" htmlFor="tx-search">
          Buscar
        </label>
        <input
          id="tx-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar descrição, nota ou tag"
          autoCorrect="off"
          enterKeyHint="search"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca" style={{ minWidth: 32, minHeight: 32 }}>
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="chips fu" role="group" aria-label="Filtros" style={{ animationDelay: '40ms' }}>
        {TYPES.map((t) => (
          <button key={t.label} type="button" className="chip" aria-pressed={type === t.id} onClick={() => setParam('type', t.id ?? null)}>
            {t.label}
          </button>
        ))}
        <button type="button" className="chip" aria-pressed={unreviewed} onClick={() => setParam('unreviewed', unreviewed ? null : '1')}>
          Não revisadas
        </button>
        <button type="button" className="chip row" style={{ gap: 6 }} aria-pressed={extraFilters > 0} onClick={filterSheet.open}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          Filtros{extraFilters ? ` (${extraFilters})` : ''}
        </button>
      </div>

      {totals && (
        <div className="fu" style={{ animationDelay: '80ms', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <div className="card stack" style={{ gap: 6 }}>
            <span className="small muted">Gastos</span>
            <Money cents={totals.expenseCents} style={{ fontSize: 20, fontWeight: 600 }} />
          </div>
          <div className="card stack" style={{ gap: 6 }}>
            <span className="small muted">Entradas</span>
            <Money cents={totals.incomeCents} style={{ fontSize: 20, fontWeight: 600, color: 'var(--positive)' }} />
          </div>
        </div>
      )}

      {unreviewed && items.length > 0 && (
        <button
          type="button"
          className="btn"
          disabled={review.isPending}
          onClick={() => review.mutate({ all: true }, { onSuccess: (r) => toast(`${r.updated} transações revisadas`) })}
        >
          Marcar todas como revisadas
        </button>
      )}

      {q.error && !q.data && <p className="muted">Não foi possível carregar. {q.error.message}</p>}
      {q.data && items.length === 0 && (
        <div className="card-lg empty">
          <span>Nada encontrado.</span>
          <span className="small">{unreviewed ? 'Tudo revisado por aqui.' : 'Tente outro filtro ou busca.'}</span>
        </div>
      )}

      {groupByDay(items).map((g, gi) => (
        <section key={g.day} className="stack" style={{ gap: 10 }} aria-label={label(g.day)}>
          <h2 className="small muted" style={{ fontWeight: 500, paddingLeft: 4 }}>
            {label(g.day)}
          </h2>
          <div className="list">
            {g.items.map((t, i) => (
              <TxRow
                key={t.id}
                tx={t}
                delay={Math.min(gi * 40 + i * 30, 300)}
                meta={`${t.category?.name ?? 'Sem categoria'} · ${t.accountName}${t.manual ? '' : ` · ${time.format(new Date(t.date))}`}`}
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
      {totals && items.length > 0 && (
        <p className="small muted" style={{ textAlign: 'center' }}>
          {totals.count} {totals.count === 1 ? 'transação' : 'transações'}
        </p>
      )}

      <Sheet state={filterSheet.state} onClose={filterSheet.close} title="Filtros">
        <FilterGroup label="Período">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={period === p.id} onClick={() => setParam('period', p.id === 'all' ? null : p.id)}>
              {p.label}
            </button>
          ))}
        </FilterGroup>
        <FilterGroup label="Conta">
          <button type="button" className="chip" aria-pressed={!accountId} onClick={() => setParam('accountId', null)}>
            Todas
          </button>
          {accounts.map((a) => (
            <button key={a.id} type="button" className="chip" aria-pressed={accountId === a.id} onClick={() => setParam('accountId', a.id)}>
              {a.name}
            </button>
          ))}
        </FilterGroup>
        <FilterGroup label="Categoria">
          <button type="button" className="chip" aria-pressed={!categoryId} onClick={() => setParam('categoryId', null)}>
            Todas
          </button>
          {categories.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={categoryId === c.id} onClick={() => setParam('categoryId', c.id)}>
              {c.name}
            </button>
          ))}
        </FilterGroup>
        <div className="stack" style={{ gap: 4 }}>
          <button type="button" className="btn" onClick={filterSheet.close}>
            Ver {totals ? `${totals.count} ` : ''}resultados
          </button>
          {extraFilters > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                setParams(
                  (p) => {
                    const next = new URLSearchParams(p);
                    ['period', 'accountId', 'categoryId'].forEach((k) => next.delete(k));
                    return next;
                  },
                  { replace: true },
                )
              }
            >
              Limpar filtros
            </button>
          )}
        </div>
      </Sheet>
    </main>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="stack" style={{ gap: 10 }} aria-label={label}>
      <h3 className="small muted" style={{ margin: 0, fontWeight: 500 }}>
        {label}
      </h3>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }} role="group">
        {children}
      </div>
    </section>
  );
}
