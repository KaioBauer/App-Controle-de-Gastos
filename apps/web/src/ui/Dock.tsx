import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { TabIcon } from './icons';
import { NewExpenseSheet } from './NewExpenseSheet';
import { useSheet } from './Sheet';

const TABS = [
  { to: '/', label: 'Início', icon: 'home', end: true },
  { to: '/cartoes', label: 'Cartões', icon: 'card' },
  { to: '/analise', label: 'Análise', icon: 'chart' },
  { to: '/orcamentos', label: 'Orçamentos', icon: 'target' },
] as const;

/** Aba só com o ícone: 22px de ícone + 11px de cada lado. */
const ICON_TAB = 44;
const LABEL_GAP = 6;
const BAR_PADDING = 6;

function tabIndexFor(pathname: string) {
  const i = TABS.findIndex((t) => ('end' in t ? pathname === t.to : pathname === t.to || pathname.startsWith(`${t.to}/`)));
  return i;
}

interface Layout {
  xs: number[];
  widths: number[];
  /** Tela estreita demais para o nome da aba: fica só o ícone */
  compact: boolean;
}

/**
 * Posição final de cada aba com `active` aberta, distribuídas como space-between.
 * Calculada de uma vez: a animação é só transform (roda fora da thread principal no iPhone).
 */
function computeLayout(barWidth: number, labelWidths: number[], active: number): Layout {
  const inner = barWidth - BAR_PADDING * 2;
  const widthsFor = (compact: boolean) =>
    TABS.map((_, i) => (i === active && !compact ? ICON_TAB + LABEL_GAP + labelWidths[i]! : ICON_TAB));
  let compact = false;
  let widths = widthsFor(false);
  if (widths.reduce((s, w) => s + w, 0) > inner) {
    compact = true;
    widths = widthsFor(true);
  }
  const gap = (inner - widths.reduce((s, w) => s + w, 0)) / (TABS.length - 1);
  const xs: number[] = [];
  let x = BAR_PADDING;
  for (const w of widths) {
    xs.push(x);
    x += w + gap;
  }
  return { xs, widths, compact };
}

/** Tab bar flutuante + botão de adicionar gasto. */
export function Dock() {
  const sheet = useSheet();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const nav = useRef<HTMLElement>(null);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);

  const routeIndex = tabIndexFor(pathname);
  // A aba tocada vira ativa na hora; a rota troca um quadro depois, já com a animação andando
  const [pending, setPending] = useState<number | null>(null);
  const active = pending ?? routeIndex;

  const [size, setSize] = useState<{ bar: number; labels: number[] } | null>(null);
  // Na primeira medição tudo aparece no lugar, sem deslizar a partir da esquerda
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const measure = () => setSize({ bar: el.clientWidth, labels: labels.current.map((l) => l?.scrollWidth ?? 0) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // A fonte pode chegar depois e mudar a largura dos nomes
    document.fonts?.ready.then(measure).catch(() => {});
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  useLayoutEffect(() => {
    setPending(null);
  }, [pathname]);

  const layout = size ? computeLayout(size.bar, size.labels, Math.max(active, 0)) : null;
  const pillX = layout && active >= 0 ? layout.xs[active]! : 0;
  const pillW = layout && active >= 0 ? layout.widths[active]! : ICON_TAB;

  const go = (e: MouseEvent, i: number) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (i === routeIndex) return;
    flushSync(() => setPending(i));
    // Força o cálculo de estilo: a transição começa antes do trabalho de montar a tela nova
    void nav.current?.getBoundingClientRect();
    // Próximo quadro (com uma rede de segurança se o navegador segurar os quadros)
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      navigate(TABS[i]!.to);
    };
    requestAnimationFrame(run);
    setTimeout(run, 50);
  };

  return (
    <>
      <div className="dock">
        <div className="dock-inner">
          <nav className="tabbar" aria-label="Navegação principal" ref={nav} data-animate={animate} data-ready={!!layout}>
            {/* Pílula em 3 partes (pontas + miolo esticado): muda de largura só com transform */}
            <span className="tab-pill" aria-hidden="true" style={{ opacity: active >= 0 && layout ? undefined : 0 }}>
              <span className="pill-cap" style={{ transform: `translateX(${pillX}px)` }} />
              <span className="pill-mid" style={{ transform: `translateX(${pillX + 23}px) scaleX(${Math.max(0, pillW - 46)})` }} />
              <span className="pill-cap pill-cap-r" style={{ transform: `translateX(${pillX + pillW - 24}px)` }} />
            </span>
            {TABS.map((t, i) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={'end' in t}
                className="tab"
                aria-label={t.label}
                data-active={i === active}
                onClick={(e) => go(e, i)}
                style={layout ? { transform: `translateX(${layout.xs[i]}px)`, width: layout.widths[i] } : undefined}
              >
                <TabIcon name={t.icon} />
                <span
                  className="lb"
                  aria-hidden="true"
                  ref={(el) => {
                    labels.current[i] = el;
                  }}
                  data-hidden={layout?.compact}
                >
                  {t.label}
                </span>
              </NavLink>
            ))}
          </nav>
          <button type="button" className="fab" onClick={sheet.open} aria-label="Novo lançamento">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>
      <NewExpenseSheet state={sheet.state} onClose={sheet.close} onSaved={() => navigate('/')} />
    </>
  );
}
