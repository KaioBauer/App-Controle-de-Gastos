import type { ReportsDTO } from '@financas/shared';
import { addMonths, formatBRL, localDate, monthName } from '@financas/shared';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { usePrivacy } from '../lib/privacy';
import { useCompare, useReports } from '../lib/queries';
import { CategoryIcon } from '../ui/icons';
import { useToast } from '../ui/Toast';

const MONTH_LETTER = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const short = (ym: string) => MONTH_LETTER[Number(ym.slice(5, 7)) - 1]!;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const longMonth = (ym: string) => `${cap(monthName(ym))} ${ym.slice(0, 4)}`;

/** Fluxo de caixa, saldo em conta, comparação de meses e exportação (seção da aba Análise). */
export function Reports() {
  const { data } = useReports();
  if (!data) return null;
  return (
    <>
      <h2 className="h2" style={{ marginTop: 8 }}>
        Relatórios
      </h2>
      <Cashflow data={data} />
      <BalanceLine data={data} />
      <CompareMonths />
      <ExportCsv />
    </>
  );
}

function Cashflow({ data }: { data: ReportsDTO }) {
  const { hidden } = usePrivacy();
  const rows = data.cashflow;
  const [sel, setSel] = useState(rows.length - 1);
  const max = Math.max(...rows.map((r) => Math.max(r.incomeCents, r.expenseCents)), 1);
  const cur = rows[sel]!;
  const money = (c: number) => (hidden ? 'R$ ••••' : formatBRL(c));
  const net = cur.incomeCents - cur.expenseCents;

  return (
    <section className="card-lg stack fu" style={{ gap: 14 }} aria-label="Fluxo de caixa">
      <div className="stack" style={{ gap: 4 }}>
        <h3 className="h3">Fluxo de caixa</h3>
        <span className="small muted" aria-live="polite">
          {longMonth(cur.month)}: entrou <span style={{ color: 'var(--positive)' }}>{money(cur.incomeCents)}</span>, saiu{' '}
          <span style={{ color: 'var(--ink)' }}>{money(cur.expenseCents)}</span> ·{' '}
          {net >= 0 ? 'sobrou' : 'faltou'} {money(Math.abs(net))}
        </span>
      </div>
      <div className="row" style={{ height: 130, alignItems: 'flex-end', gap: 4 }}>
        {rows.map((r, i) => (
          <button
            key={r.month}
            type="button"
            onClick={() => setSel(i)}
            aria-pressed={i === sel}
            aria-label={`${longMonth(r.month)}: entradas ${money(r.incomeCents)}, saídas ${money(r.expenseCents)}`}
            className="stack"
            style={{ flex: 1, minWidth: 0, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 6, opacity: i === sel ? 1 : 0.55, transition: 'opacity .2s' }}
          >
            <span className="row" style={{ alignItems: 'flex-end', gap: 2, height: 104, width: '100%', justifyContent: 'center' }}>
              <span className="gy" style={{ width: '40%', maxWidth: 10, borderRadius: 4, background: 'var(--cat3)', height: Math.max(3, (r.incomeCents / max) * 104), animationDelay: `${i * 30}ms` }} />
              <span className="gy" style={{ width: '40%', maxWidth: 10, borderRadius: 4, background: 'var(--cat2)', height: Math.max(3, (r.expenseCents / max) * 104), animationDelay: `${i * 30}ms` }} />
            </span>
            <span className="bar-label">{short(r.month)}</span>
          </button>
        ))}
      </div>
      <div className="row small muted" style={{ gap: 14 }}>
        <span className="row" style={{ gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--cat3)' }} /> Entradas
        </span>
        <span className="row" style={{ gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--cat2)' }} /> Saídas
        </span>
      </div>
    </section>
  );
}

function BalanceLine({ data }: { data: ReportsDTO }) {
  const { hidden } = usePrivacy();
  const pts = data.balance;
  const [sel, setSel] = useState(pts.length - 1);
  const W = 300;
  const H = 110;
  const vals = pts.map((p) => p.balanceCents);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 1);
  const x = (i: number) => (pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * W);
  const y = (v: number) => H - 8 - ((v - min) / (max - min || 1)) * (H - 16);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.balanceCents).toFixed(1)}`).join(' ');
  const cur = pts[sel]!;

  return (
    <section className="card-lg stack fu" style={{ gap: 12 }} aria-label="Saldo em conta">
      <div className="stack" style={{ gap: 4 }}>
        <h3 className="h3">Saldo em conta</h3>
        <span className="small muted" aria-live="polite">
          Fim de {monthName(cur.month)}: <span style={{ color: 'var(--ink)' }}>{hidden ? 'R$ ••••' : formatBRL(cur.balanceCents)}</span>
          {data.investmentsCents > 0 && <> · investimentos hoje {hidden ? 'R$ ••••' : formatBRL(data.investmentsCents)}</>}
        </span>
      </div>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true" style={{ overflow: 'visible' }}>
          <polygon points={`0,${H} ${line} ${W},${H}`} fill="var(--cat4)" opacity="0.12" />
          <polyline points={line} fill="none" stroke="var(--cat4)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="dr" />
          {min < 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--c5)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* Ponto fora do SVG: com preserveAspectRatio="none" um círculo viraria elipse */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `${(x(sel) / W) * 100}%`,
            top: y(cur.balanceCents),
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
            borderRadius: 6,
            background: 'var(--accent)',
            border: '2px solid var(--surface)',
            transition: 'left .3s var(--ease), top .3s var(--ease)',
            pointerEvents: 'none',
          }}
        />
        {/* Áreas de toque por mês, sobre o gráfico */}
        <div className="row" style={{ position: 'absolute', inset: 0 }}>
          {pts.map((p, i) => (
            <button
              key={p.month}
              type="button"
              style={{ flex: 1, height: '100%' }}
              onClick={() => setSel(i)}
              aria-label={`Fim de ${monthName(p.month)}: ${hidden ? 'valor oculto' : formatBRL(p.balanceCents)}`}
            />
          ))}
        </div>
      </div>
      <div className="between">
        {pts.map((p) => (
          <span key={p.month} className="bar-label" style={{ flex: 1, textAlign: 'center' }}>
            {short(p.month)}
          </span>
        ))}
      </div>
    </section>
  );
}

function CompareMonths() {
  const { hidden } = usePrivacy();
  const thisMonth = localDate(new Date()).slice(0, 7);
  const options = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, -i));
  const [a, setA] = useState(addMonths(thisMonth, -1));
  const [b, setB] = useState(thisMonth);
  const { data } = useCompare(a, b);
  const money = (c: number) => (hidden ? '••••' : formatBRL(c));
  const select = (value: string, onChange: (v: string) => void, label: string) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ flex: 1, minWidth: 0, height: 44, border: 0, borderRadius: 14, background: 'var(--fill)', color: 'var(--ink)', padding: '0 12px', fontSize: 15 }}
    >
      {options.map((m) => (
        <option key={m} value={m}>
          {longMonth(m)}
        </option>
      ))}
    </select>
  );

  return (
    <section className="card-lg stack fu" style={{ gap: 14 }} aria-label="Comparar meses">
      <h3 className="h3">Comparar meses</h3>
      <div className="row" style={{ gap: 8 }}>
        {select(a, setA, 'Primeiro mês')}
        <span className="small muted">vs</span>
        {select(b, setB, 'Segundo mês')}
      </div>
      {data && (
        <>
          <div className="between small">
            <span className="muted">Total</span>
            <span className="num">
              {money(data.aTotalCents)} → <strong>{money(data.bTotalCents)}</strong>
            </span>
          </div>
          <div className="stack" style={{ gap: 2 }}>
            {data.rows.slice(0, 8).map((r) => (
              <div key={r.id} className="row" style={{ gap: 10, padding: '8px 0' }}>
                <span className="tile tile-sm">
                  <CategoryIcon icon={r.icon} size={18} />
                </span>
                <span className="item-main">
                  <span className="item-title" style={{ fontSize: 14 }}>
                    {r.name}
                  </span>
                  <span className="item-sub num">
                    {money(r.aCents)} → {money(r.bCents)}
                  </span>
                </span>
                <span className="num small" style={{ fontWeight: 600, color: r.deltaCents > 0 ? 'var(--danger)' : r.deltaCents < 0 ? 'var(--positive)' : 'var(--ink-2)' }}>
                  {r.deltaCents > 0 ? '+' : r.deltaCents < 0 ? '−' : ''}
                  {money(Math.abs(r.deltaCents))}
                </span>
              </div>
            ))}
            {data.rows.length === 0 && <p className="small muted">Sem gastos nesses meses.</p>}
          </div>
        </>
      )}
    </section>
  );
}

function ExportCsv() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const today = localDate(new Date());
  const ranges = [
    { label: 'Este mês', from: `${today.slice(0, 7)}-01` },
    { label: '3 meses', from: `${addMonths(today.slice(0, 7), -2)}-01` },
    { label: '12 meses', from: `${addMonths(today.slice(0, 7), -11)}-01` },
  ];
  const [from, setFrom] = useState(ranges[2]!.from);

  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/reports/export.csv?from=${from}&to=${today}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const blob = await res.blob();
      const name = `kaixa-${from}-a-${today}.csv`;
      const file = new File([blob], name, { type: 'text/csv' });
      // No iPhone o compartilhamento abre "Salvar em Arquivos", Planilhas, AirDrop…
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name }).catch(() => {});
      } else {
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: name });
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      toast(`Não foi possível exportar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card-lg stack fu" style={{ gap: 12 }} aria-label="Exportar">
      <div className="stack" style={{ gap: 4 }}>
        <h3 className="h3">Exportar planilha</h3>
        <span className="small muted">CSV para Excel ou Google Planilhas, com categoria, conta, notas e tags.</span>
      </div>
      <div className="chips" role="group" aria-label="Período da planilha">
        {ranges.map((r) => (
          <button key={r.label} type="button" className="chip" aria-pressed={from === r.from} onClick={() => setFrom(r.from)}>
            {r.label}
          </button>
        ))}
      </div>
      <button type="button" className="btn" onClick={download} disabled={busy}>
        <Download size={18} strokeWidth={2} aria-hidden="true" />
        {busy ? 'Gerando…' : 'Exportar CSV'}
      </button>
    </section>
  );
}
