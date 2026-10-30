import type { CardDTO } from '@financas/shared';
import { addDays, localDate } from '@financas/shared';
import { ChevronRight, CreditCard, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Money, useCountUp } from '../lib/privacy';
import { useBillTransactions, useCards } from '../lib/queries';
import { Bars, Donut } from '../ui/charts';
import { OfflineBanner, relativeDay, TxRow } from '../ui/common';
import { CategoryIcon } from '../ui/icons';
import { Sheet, useSheet } from '../ui/Sheet';

const shortDate = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthYear = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const monthShort = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });
const monthLong = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });

const d = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
const clean = (s: string) => s.replace('.', '').replace(' de ', ' ');
/** "4 nov" */
const fmtDay = (ymd: string) => clean(shortDate.format(d(ymd)));
/** "jun/27" */
const fmtMonthYear = (ymd: string) => clean(monthYear.format(d(ymd)));

function SectionTitle({ id, title, right }: { id?: string; title: string; right?: React.ReactNode }) {
  return (
    <div id={id} className="section-title" style={{ scrollMarginTop: 16 }}>
      <h2 className="h2">{title}</h2>
      {right && <span className="small muted">{right}</span>}
    </div>
  );
}

export function Cards() {
  const { data, error } = useCards();
  const [index, setIndex] = useState(0);
  const card = data?.cards[index] ?? data?.cards[0];

  return (
    <main className="page">
      <h1 className="h1 fu">Cartões</h1>
      <OfflineBanner />

      {error && !data && <p className="muted">Não foi possível carregar. {error.message}</p>}

      {data && data.cards.length === 0 && (
        <div className="card-lg empty fu">
          <CreditCard size={36} strokeWidth={1.5} aria-hidden="true" />
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Nenhum cartão de crédito</span>
          <span className="small">Conecte o banco do seu cartão em Ajustes › Conexões bancárias.</span>
        </div>
      )}

      {data && data.cards.length > 1 && (
        <div className="chips fu" role="group" aria-label="Cartão">
          {data.cards.map((c, i) => (
            <button key={c.accountId} type="button" className="chip" aria-pressed={i === index} onClick={() => setIndex(i)}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {card && <CardView key={card.accountId} card={card} />}
    </main>
  );
}

function CardView({ card }: { card: CardDTO }) {
  const bill = card.openBill;
  const shown = useCountUp(bill.totalCents);
  const usedPct = card.limitCents ? Math.min(100, (card.usedCents / card.limitCents) * 100) : 0;
  const today = localDate(new Date());
  const yesterday = addDays(today, -1);
  const billSheet = useSheet();
  const [billId, setBillId] = useState<{ id: string; dueDate: string; totalCents: number } | null>(null);
  // Categoria tocada na rosca filtra as compras da fatura logo abaixo
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const purchases = catFilter ? bill.transactions.filter((t) => (t.category?.name ?? 'Sem categoria') === catFilter) : bill.transactions;
  const purchasesCents = purchases.reduce((sum, t) => sum - t.amountCents, 0);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const txLink = (name: string) => `/transacoes?q=${encodeURIComponent(name)}&accountId=${card.accountId}`;

  return (
    <>
      <section className="hero fu" style={{ animationDelay: '60ms' }} aria-label="Fatura atual">
        <div className="between">
          <span className="muted" style={{ fontSize: 14 }}>
            {card.name} · fatura atual
          </span>
          <span className="tag">Fecha {fmtDay(bill.closeDate)}</span>
        </div>
        <button type="button" className="press" style={{ textAlign: 'left' }} onClick={() => scrollTo('compras-fatura')} aria-label="Ver compras da fatura">
          <Money cents={shown} splitSymbol symbolStyle={{ fontSize: 22, color: 'var(--hero-ink-2)' }} style={{ fontSize: 44, fontWeight: 600, lineHeight: 1 }} />
        </button>
        {bill.dueDate && (
          <span className="small muted" style={{ marginTop: -8 }}>
            Vence por volta de {fmtDay(bill.dueDate)}
          </span>
        )}
        {card.limitCents != null && (
          <div className="stack" style={{ gap: 10 }}>
            <div className="between small">
              <span className="muted">Limite usado</span>
              <span>
                <Money cents={card.usedCents} />
                <span className="muted">
                  {' '}
                  de <Money cents={card.limitCents} />
                </span>
              </span>
            </div>
            <div className="track" role="progressbar" aria-label="Limite usado" aria-valuenow={Math.round(usedPct)} aria-valuemin={0} aria-valuemax={100}>
              <div className="gx" style={{ width: `${usedPct}%` }} />
            </div>
            {card.availableCents != null && (
              <span className="small muted">
                Disponível: <Money cents={card.availableCents} />
              </span>
            )}
          </div>
        )}
      </section>

      <div className="fu" style={{ animationDelay: '120ms', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <button
          type="button"
          className="card stack press"
          style={{ gap: 6, textAlign: 'left' }}
          disabled={card.recurring.length === 0}
          onClick={() => scrollTo('despesas-fixas')}
        >
          <span className="small muted">Despesas fixas</span>
          <span style={{ fontSize: 20, fontWeight: 600 }}>
            <Money cents={card.recurringTotalCents} />
            <span className="small muted" style={{ fontWeight: 400 }}>
              /mês
            </span>
          </span>
        </button>
        <button
          type="button"
          className="card stack press"
          style={{ gap: 6, textAlign: 'left' }}
          disabled={card.installments.length === 0}
          onClick={() => scrollTo('parcelamentos')}
        >
          <span className="small muted">Parcelas a pagar</span>
          <Money cents={card.installmentsRemainingCents} style={{ fontSize: 20, fontWeight: 600 }} />
        </button>
      </div>

      {card.futureBills.some((b) => b.totalCents > 0) && (
        <section className="card-lg stack fu" style={{ animationDelay: '180ms', gap: 16 }} aria-label="Próximas faturas">
          <div className="stack" style={{ gap: 4 }}>
            <h2 className="h3">Próximas faturas</h2>
            <span className="small muted">Parcelas já lançadas em cada fatura</span>
          </div>
          <Bars
            bars={card.futureBills.map((b) => ({
              label: clean(monthShort.format(d(b.close))),
              name: `fatura de ${monthLong.format(d(b.close))}`,
              cents: b.totalCents,
            }))}
          />
        </section>
      )}

      {card.recurring.length > 0 && (
        <>
          <SectionTitle id="despesas-fixas" title="Despesas fixas" right={<Money cents={card.recurringTotalCents} />} />
          <div className="list fu">
            {card.recurring.map((r) => (
              <Link key={r.name} to={txLink(r.name)} className="item">
                <div className="tile">
                  <CategoryIcon icon={r.icon} />
                </div>
                <div className="item-main">
                  <span className="item-title">{r.name}</span>
                  <span className="item-sub">
                    {r.categoryName} · próxima {fmtDay(r.nextDate)}
                  </span>
                </div>
                <Money cents={r.amountCents} className="item-amt" />
              </Link>
            ))}
          </div>
        </>
      )}

      {card.installments.length > 0 && (
        <>
          <SectionTitle id="parcelamentos" title="Parcelamentos" right={<>falta <Money cents={card.installmentsRemainingCents} /></>} />
          <div className="list fu">
            {card.installments.map((i) => (
              <Link key={`${i.name}-${i.lastDate}`} to={txLink(i.name)} className="item" style={{ flexWrap: 'wrap', rowGap: 10 }}>
                <div className="tile">
                  <CategoryIcon icon={i.icon} />
                </div>
                <div className="item-main">
                  <span className="item-title">{i.name}</span>
                  <span className="item-sub">
                    {i.current} de {i.total} · até {fmtMonthYear(i.lastDate)}
                  </span>
                </div>
                <div className="stack" style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Money cents={i.installmentCents} className="item-amt" />
                  <span className="small muted">
                    falta <Money cents={i.remainingCents} />
                  </span>
                </div>
                <div
                  className="track"
                  style={{ width: '100%', height: 6 }}
                  role="progressbar"
                  aria-label={`${i.name}: parcela ${i.current} de ${i.total}`}
                  aria-valuenow={i.current}
                  aria-valuemin={0}
                  aria-valuemax={i.total}
                >
                  <div className="gx" style={{ width: `${(i.current / i.total) * 100}%` }} />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {bill.categories.length > 0 && (
        <section className="card-lg stack fu" style={{ gap: 18 }} aria-label="Fatura atual por categoria">
          <h2 className="h3">Fatura atual por categoria</h2>
          <Donut
            items={bill.categories}
            label={`${bill.categories.length} ${bill.categories.length === 1 ? 'categoria' : 'categorias'}`}
            selected={catFilter}
            onSelect={(c) => {
              setCatFilter(catFilter === c.name ? null : c.name);
              scrollTo('compras-fatura');
            }}
          />
        </section>
      )}

      <SectionTitle
        id="compras-fatura"
        title="Compras da fatura"
        right={
          <>
            {purchases.length} {purchases.length === 1 ? 'compra' : 'compras'} ·{' '}
            <Money cents={catFilter ? purchasesCents : bill.totalCents} style={{ color: 'var(--ink)', fontWeight: 600 }} />
          </>
        }
      />
      {catFilter && (
        <div className="chips">
          <button type="button" className="chip row" aria-pressed="true" style={{ gap: 6 }} onClick={() => setCatFilter(null)} aria-label={`Remover filtro ${catFilter}`}>
            {catFilter}
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="list">
        {purchases.length === 0 ? (
          <p className="empty">Nenhuma compra na fatura aberta.</p>
        ) : (
          purchases.map((t, i) => (
            <TxRow
              key={t.id}
              tx={t}
              delay={Math.min(i * 30, 400)}
              meta={`${t.category?.name ?? 'Sem categoria'} · ${relativeDay(t.localDate, t.date, today, yesterday)}`}
            />
          ))
        )}
      </div>

      {card.bills.length > 0 && (
        <>
          <SectionTitle title="Faturas anteriores" />
          <div className="list">
            {card.bills.map((b) => (
              <button
                key={b.id}
                type="button"
                className="item"
                onClick={() => {
                  setBillId({ id: b.id, dueDate: b.dueDate, totalCents: b.totalCents });
                  billSheet.open();
                }}
              >
                <div className="item-main">
                  <span className="item-title" style={{ textTransform: 'capitalize' }}>
                    {monthLong.format(d(b.dueDate))}
                  </span>
                  <span className="item-sub">Venceu {fmtDay(b.dueDate)}</span>
                </div>
                <Money cents={b.totalCents} className="item-amt" />
                <ChevronRight className="item-chevron" size={20} aria-hidden="true" />
              </button>
            ))}
          </div>
        </>
      )}

      <Sheet
        state={billSheet.state}
        onClose={billSheet.close}
        title={billId ? `Fatura de ${monthLong.format(d(billId.dueDate))}` : 'Fatura'}
      >
        {billId && <BillTransactions billId={billId.id} totalCents={billId.totalCents} />}
      </Sheet>
    </>
  );
}

function BillTransactions({ billId, totalCents }: { billId: string; totalCents: number }) {
  const { data, error } = useBillTransactions(billId);
  const today = localDate(new Date());
  const yesterday = addDays(today, -1);
  if (error) return <p className="muted">{error.message}</p>;
  if (!data) return <p className="muted">Carregando…</p>;
  if (data.items.length === 0) return <p className="muted">Sem compras registradas nesta fatura.</p>;
  // Soma das compras (estornos abatem); o total da fatura pode incluir encargos e saldo anterior
  const purchases = -data.items.reduce((s, t) => s + t.amountCents, 0);
  return (
    <>
      <div className="stack" style={{ alignItems: 'center', gap: 6, padding: '4px 0 8px' }}>
        <Money cents={totalCents} style={{ fontSize: 40, fontWeight: 600, lineHeight: 1 }} />
        <span className="small muted">
          {data.items.length} {data.items.length === 1 ? 'compra' : 'compras'} · total das compras <Money cents={purchases} />
        </span>
      </div>
      <div className="stack" style={{ margin: '0 -12px' }}>
        {data.items.map((t) => (
          <TxRow key={t.id} tx={t} meta={`${t.category?.name ?? 'Sem categoria'} · ${relativeDay(t.localDate, t.date, today, yesterday)}`} />
        ))}
      </div>
    </>
  );
}
