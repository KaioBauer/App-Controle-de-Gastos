import { formatBRL } from '@financas/shared';
import { useState } from 'react';
import { usePrivacy } from '../lib/privacy';

const BAR_MAX_PX = 112;

/** Barras do período. O maior valor fica em destaque; tocar numa barra mostra o valor dela. */
export function Bars({ bars }: { bars: { label: string; name: string; cents: number }[] }) {
  const { hidden } = usePrivacy();
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(...bars.map((b) => b.cents), 0);
  const peak = max > 0 ? bars.findIndex((b) => b.cents === max) : -1;
  const focus = selected ?? peak;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="small muted" aria-live="polite" style={{ minHeight: 18 }}>
        {focus >= 0 && (
          <>
            {selected === null ? 'Maior: ' : ''}
            {bars[focus]!.name}
            {' · '}
            <span className="num" style={{ color: 'var(--ink)' }}>
              {hidden ? 'R$ ••••' : formatBRL(bars[focus]!.cents)}
            </span>
          </>
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
export const DONUT_COLORS = ['var(--c1)', 'var(--accent)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];

/** Rosca por categoria: 4 maiores + "Outras". */
export function Donut({ items, label }: { items: { name: string; cents: number }[]; label: string }) {
  const { hidden } = usePrivacy();
  const total = items.reduce((s, i) => s + i.cents, 0);
  const top = items.slice(0, 4);
  const rest = items.slice(4).reduce((s, i) => s + i.cents, 0);
  const slices = rest > 0 ? [...top, { name: 'Outras', cents: rest }] : top;

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
      <ul className="stack" style={{ flex: 1, minWidth: 0, gap: 10, listStyle: 'none', margin: 0, padding: 0 }} aria-hidden="true">
        {slices.map((s, i) => (
          <li key={s.name} className="row small" style={{ gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: DONUT_COLORS[i], flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
            <span className="num muted">{pct(s.cents)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
