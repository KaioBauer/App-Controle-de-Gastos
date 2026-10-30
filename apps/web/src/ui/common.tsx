import type { TransactionDTO } from '@financas/shared';
import { ChevronLeft, WifiOff } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useOnline } from '../lib/platform';
import { Money } from '../lib/privacy';
import { CategoryIcon } from './icons';
import { useOpenTransaction } from './TransactionSheet';

/** Cabeçalho das telas internas: voltar + título grande. */
export function PageHeader({ title, back, subtitle }: { title: string; back?: string; subtitle?: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="stack fu" style={{ gap: 14 }}>
      {back && (
        <button type="button" className="round-btn press" onClick={() => navigate(back)} aria-label="Voltar">
          <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="h1">{title}</h1>
        {subtitle && <p style={{ fontSize: 15 }} className="muted">{subtitle}</p>}
      </div>
    </div>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="banner fu" role="status">
      <WifiOff size={18} aria-hidden="true" />
      Dados offline: mostrando a última versão salva.
    </div>
  );
}

const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "12:40" hoje, "Ontem" ou "28 out". */
export function relativeDay(localDate: string, iso: string, today: string, yesterday: string): string {
  if (localDate === today) return time.format(new Date(iso));
  if (localDate === yesterday) return 'Ontem';
  return dayMonth.format(new Date(`${localDate}T00:00:00Z`)).replace('.', '');
}

export function TxRow({ tx, meta, isNew, delay }: { tx: TransactionDTO; meta: string; isNew?: boolean; delay?: number }) {
  const open = useOpenTransaction();
  const income = tx.amountCents > 0 && !tx.isTransfer;
  // Estorno numa categoria de gasto: valor em verde, mas com o ícone da categoria
  const incomeIcon = income && (!tx.category || tx.category.kind === 'INCOME');
  return (
    <button
      type="button"
      className={`item ${isNew ? 'newrow' : 'fu'}`}
      style={{ animationDelay: `${isNew ? 0 : (delay ?? 0)}ms` }}
      onClick={() => open?.(tx)}
      aria-label={`${tx.description}${tx.reviewed ? '' : ', não revisada'}`}
    >
      <div className={`tile ${incomeIcon ? 'tile-accent' : ''}`} style={{ position: 'relative' }}>
        <CategoryIcon icon={incomeIcon ? 'income' : tx.category?.icon} />
        {!tx.reviewed && <span className="unreviewed-dot" aria-hidden="true" />}
      </div>
      <div className="item-main">
        <span className="item-title">{tx.description}</span>
        <span className="item-sub">{meta}</span>
      </div>
      <Money
        cents={tx.amountCents}
        sign="auto"
        className="item-amt"
        style={{ color: income ? 'var(--positive)' : tx.isTransfer ? 'var(--ink-2)' : 'var(--ink)' }}
      />
    </button>
  );
}

/** Só o visual: o papel de switch (role/aria-checked) fica no botão da linha inteira. */
export function Switch({ checked }: { checked: boolean }) {
  return <span className="switch" data-on={checked} aria-hidden="true" />;
}
