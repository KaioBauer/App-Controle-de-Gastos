import { formatBRL } from '@financas/shared';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { usePrivacy } from '../lib/privacy';

const BAR_MAX_PX = 112;

/**
 * Barras do período. O maior valor fica em destaque; tocar numa barra mostra o valor dela
 * e, com `linkFor`, um atalho para as transações daquela barra.
 */
export function Bars({
  bars,
  linkFor,
}: {
  bars: { label: string; name: string; cents: number }[];
  linkFor?: (index: number) => string | null;
}) {
  const { hidden } = usePrivacy();
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(...bars.map((b) => b.cents), 0);
  const peak = max > 0 ? bars.findIndex((b) => b.cents === max) : -1;
  const focus = selected ?? peak;
  const link = focus >= 0 && bars[focus]!.cents > 0 ? linkFor?.(focus) : null;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="between small muted" aria-live="polite" style={{ minHeight: 18, gap: 8 }}>
        {focus >= 0 && (
          <span>
            {selected === null ? 'Maior: ' : ''}
            {bars[focus]!.name}
            {' · '}
            <span className="num" style={{ color: 'var(--ink)' }}>
              {hidden ? 'R$ ••••' : formatBRL(bars[focus]!.cents)}
            </span>
          </span>
        )}
        {link && (
          <Link to={link} className="link row" style={{ gap: 2, whiteSpace: 'nowrap' }}>
            Ver transações
            <ChevronRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
      <div className="bars">
        {bars.map((b, i) => (
          <button
            key={i}
            type="button"
            className="bar-col"
            onClick={() => setSelected(selected === i ? null : i)}
            aria-label={`${b.name}: ${hidden ? 'valor oculto' : formatBRL(b.cents)}`}
            aria-pressed={selected === i}
          >
            <div
              className="bar gy"
              data-peak={selected === null && i === peak}
              data-selected={selected === i}
              data-zero={b.cents === 0}
              style={{ height: max > 0 ? Math.max(6, Math.round((b.cents / max) * BAR_MAX_PX)) : 6, animationDelay: `${i * 50}ms` }}
            />
            <span className="bar-label">{b.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const R = 52;
const C = 2 * Math.PI * R;
// 4 maiores com cores distintas; "Outras" (o resto) em cinza
export const DONUT_COLORS = ['var(--cat1)', 'var(--cat2)', 'var(--cat3)', 'var(--cat4)', 'var(--cat-other)'];

/**
 * Rosca por categoria: 4 maiores + "Outras". Cada categoria da legenda pode abrir as transações
 * dela (`linkFor`) ou filtrar algo na própria tela (`onSelect`, com `selected` destacado).
 */
export function Donut<T extends { name: string; cents: number }>({
  items,
  label,
  linkFor,
  onSelect,
  selected,
}: {
  items: T[];
  label: string;
  linkFor?: (item: T) => string | null;
  onSelect?: (item: T) => void;
  selected?: string | null;
}) {
  const { hidden } = usePrivacy();
  const total = items.reduce((s, i) => s + i.cents, 0);
  const top = items.slice(0, 4);
  const rest = items.slice(4).reduce((s, i) => s + i.cents, 0);
  const slices: { name: string; cents: number; item?: T }[] = [
    ...top.map((item) => ({ name: item.name, cents: item.cents, item })),
    ...(rest > 0 ? [{ name: 'Outras', cents: rest }] : []),
  ];

  let cum = 0;
  const segs = slices.map((s) => {
    const len = Math.max(1, (s.cents / total) * C - 2);
    const seg = { dash: `${len.toFixed(2)} ${(C - len).toFixed(2)}`, off: (-cum).toFixed(2) };
    cum += (s.cents / total) * C;
    return seg;
  });
  const pct = (cents: number) => Math.round((cents / total) * 100);
  const aria = `Gastos por categoria: ${slices.map((s) => `${s.name} ${pct(s.cents)}%`).join(', ')}`;

  return (
    <div className="row" style={{ gap: 20 }}>
      <div style={{ position: 'relative', width: 148, height: 148, flexShrink: 0 }}>
        <svg width="148" height="148" viewBox="0 0 148 148" role="img" aria-label={aria}>
          <g transform="rotate(-90 74 74)">
            <circle cx="74" cy="74" r={R} fill="none" stroke="var(--fill)" strokeWidth="18" />
            {segs.map((s, i) => (
              <circle
                key={i}
                className="dr"
                cx="74"
                cy="74"
                r={R}
                fill="none"
                stroke={DONUT_COLORS[i]}
                strokeWidth="18"
                strokeDasharray={s.dash}
                strokeDashoffset={s.off}
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </g>
        </svg>
        <div className="stack" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {label}
          </span>
          <span className="num" style={{ fontSize: 16, fontWeight: 600 }}>
            {hidden ? 'R$ ••••' : formatBRL(total).replace(/,\d\d$/, '')}
          </span>
        </div>
      </div>
      <ul className="stack" style={{ flex: 1, minWidth: 0, gap: linkFor || onSelect ? 2 : 10, listStyle: 'none', margin: 0, padding: 0 }}>
        {slices.map((s, i) => {
          const to = s.item && linkFor ? linkFor(s.item) : null;
          const item = s.item;
          const pick = item && onSelect ? () => onSelect(item) : null;
          const isSelected = selected === s.name;
          const content = (
            <>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: DONUT_COLORS[i], flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
              <span className="num muted">{pct(s.cents)}%</span>
              {linkFor && <ChevronRight size={14} aria-hidden="true" style={{ opacity: to ? 0.5 : 0, flexShrink: 0 }} />}
            </>
          );
          return (
            <li key={s.name}>
              {pick ? (
                <button
                  type="button"
                  className="row small press"
                  style={{
                    gap: 8,
                    padding: '6px 8px',
                    margin: '0 -8px',
                    minHeight: 32,
                    width: 'calc(100% + 16px)',
                    borderRadius: 10,
                    textAlign: 'left',
                    background: isSelected ? 'var(--fill)' : undefined,
                    fontWeight: isSelected ? 600 : undefined,
                  }}
                  aria-pressed={isSelected}
                  onClick={pick}
                >
                  {content}
                </button>
              ) : to ? (
                <Link to={to} className="row small press" style={{ gap: 8, padding: '6px 0', minHeight: 32 }} aria-label={`${s.name}, ${pct(s.cents)}%: ver transações`}>
                  {content}
                </Link>
              ) : (
                <span className="row small" style={{ gap: 8, padding: linkFor || onSelect ? '6px 0' : 0 }}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
