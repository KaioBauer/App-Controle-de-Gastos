import { NavLink, useNavigate } from 'react-router';
import { TabIcon } from './icons';
import { NewExpenseSheet } from './NewExpenseSheet';
import { useSheet } from './Sheet';

const TABS = [
  { to: '/', label: 'Início', icon: 'home', end: true },
  { to: '/cartoes', label: 'Cartões', icon: 'card' },
  { to: '/analise', label: 'Análise', icon: 'chart' },
  { to: '/orcamentos', label: 'Orçamentos', icon: 'target' },
] as const;

/** Tab bar flutuante + botão de adicionar gasto. */
export function Dock() {
  const sheet = useSheet();
  const navigate = useNavigate();
  return (
    <>
      <div className="dock">
        <div className="dock-inner">
          <nav className="tabbar" aria-label="Navegação principal">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} end={'end' in t} className="tab" aria-label={t.label}>
                <TabIcon name={t.icon} />
                <span className="lb" aria-hidden="true">
                  {t.label}
                </span>
              </NavLink>
            ))}
          </nav>
          <button type="button" className="fab" onClick={sheet.open} aria-label="Adicionar gasto">
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
