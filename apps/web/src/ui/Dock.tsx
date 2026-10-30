import { useLayoutEffect, useRef, useState } from 'react';
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

interface Pill {
  x: number;
  width: number;
  visible: boolean;
}

/**
 * Pílula que desliza até a aba ativa. Acompanha o tamanho da aba enquanto o nome abre/fecha
 * (ResizeObserver), então o movimento e a expansão acontecem juntos.
 */
function useSlidingPill(nav: React.RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  const [pill, setPill] = useState<Pill>({ x: 0, width: 0, visible: false });
  // Na primeira medição a pílula aparece no lugar, sem deslizar a partir da esquerda
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const measure = () => {
      const active = el.querySelector<HTMLElement>('.tab[aria-current="page"]');
      setPill(active ? { x: active.offsetLeft, width: active.offsetWidth, visible: true } : (p) => ({ ...p, visible: false }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    el.querySelectorAll('.tab').forEach((t) => ro.observe(t));
    ro.observe(el);
    const raf = requestAnimationFrame(() => setAnimate(true));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [nav, pathname]);

  return { pill, animate };
}

/** Tab bar flutuante + botão de adicionar gasto. */
export function Dock() {
  const sheet = useSheet();
  const navigate = useNavigate();
  const nav = useRef<HTMLElement>(null);
  const { pill, animate } = useSlidingPill(nav);

  return (
    <>
      <div className="dock">
        <div className="dock-inner">
          <nav className="tabbar" aria-label="Navegação principal" ref={nav}>
            <span
              className="tab-pill"
              data-animate={animate}
              aria-hidden="true"
              style={{ width: pill.width, transform: `translateX(${pill.x}px)`, opacity: pill.visible ? 1 : 0 }}
            />
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} end={'end' in t} className="tab" aria-label={t.label}>
                <TabIcon name={t.icon} />
                <span className="lb" aria-hidden="true">
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
