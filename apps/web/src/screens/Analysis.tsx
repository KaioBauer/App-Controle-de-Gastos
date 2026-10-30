import type { Period } from '@financas/shared';
import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Money } from '../lib/privacy';
import { useAnalysis } from '../lib/queries';
import { Bars, Donut } from '../ui/charts';
import { OfflineBanner } from '../ui/common';
import { Reports } from './Reports';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
  { id: 'year', label: 'Ano' },
];

export function Analysis() {
  const [index, setIndex] = useState(1);
  const period = PERIODS[index]!.id;
  const { data, error } = useAnalysis(period);

  // Largura do indicador do segmented control acompanha o tamanho real dos botões
  const segRef = useRef<HTMLDivElement>(null);
  const [segW, setSegW] = useState(0);
  useLayoutEffect(() => {
    const el = segRef.current;
    if (!el) return;
    const measure = () => setSegW((el.clientWidth - 8) / PERIODS.length);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const delta = data?.deltaPct;
  return (
    <main className="page">
      <h1 className="h1 fu">Análise</h1>
      <OfflineBanner />

      <div className="segmented fu" ref={segRef} style={{ animationDelay: '60ms' }} role="group" aria-label="Período">
        <div className="seg-i" style={{ width: segW, transform: `translateX(${index * segW}px)` }} />
        {PERIODS.map((p, i) => (
          <button key={p.id} type="button" className="seg" aria-pressed={i === index} onClick={() => setIndex(i)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="stack fu" style={{ animationDelay: '120ms', gap: 8 }}>
        <span className="muted" style={{ fontSize: 14 }}>
          Total gasto · {data?.name ?? '…'}
        </span>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          {data ? (
            <Link to={`/transacoes?type=expense&from=${data.start}&to=${data.end}`} className="press" aria-label="Ver os gastos do período">
              <Money cents={data.totalCents} style={{ fontSize: 38, fontWeight: 600, lineHeight: 1 }} />
            </Link>
          ) : (
            <Money cents={0} style={{ fontSize: 38, fontWeight: 600, lineHeight: 1 }} />
          )}
          {delta !== null && delta !== undefined && (
            <span className="tag" style={{ fontSize: 13 }}>
              {delta > 0 ? '+' : delta < 0 ? '−' : ''}
              {Math.abs(delta)}% vs. {data!.previousName}
            </span>
          )}
        </div>
      </div>

      {error && !data && <p className="muted">Não foi possível carregar. {error.message}</p>}

      <section className="card-lg stack fu" style={{ animationDelay: '180ms', gap: 16 }} aria-label="Gasto por período">
        <h2 className="h3">Por período</h2>
        {data && (
          <Bars
            key={period}
            bars={data.bars}
            linkFor={(i) => `/transacoes?type=expense&from=${data.bars[i]!.from}&to=${data.bars[i]!.to}`}
          />
        )}
      </section>

      <section className="card-lg stack fu" style={{ animationDelay: '240ms', gap: 18 }} aria-label="Gasto por categoria">
        <h2 className="h3">Por categoria</h2>
        {data && data.categories.length > 0 ? (
          <Donut
            key={period}
            items={data.categories}
            label={`${data.categories.length} ${data.categories.length === 1 ? 'categoria' : 'categorias'}`}
            linkFor={(c) => (c.id === 'none' ? null : `/transacoes?categoryId=${c.id}&from=${data.start}&to=${data.end}`)}
          />
        ) : (
          <p className="small muted">Sem gastos neste período.</p>
        )}
      </section>

      {data?.insight && (
        <section className="hero fu" style={{ animationDelay: '300ms', flexDirection: 'row', gap: 14, alignItems: 'flex-start', padding: 20, borderRadius: 24 }}>
          <div className="tile tile-sm tile-accent">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M14 7h7v7" />
            </svg>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{data.insight.title}</span>
            <span className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>
              {data.insight.body}
            </span>
          </div>
        </section>
      )}
      <Reports />
    </main>
  );
}
