import type { BudgetDTO, CategoryDTO } from '@financas/shared';
import { formatAmount, formatBRL, monthName } from '@financas/shared';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Money, usePrivacy } from '../lib/privacy';
import { useBudgets, useDeleteBudget, useSetBudget } from '../lib/queries';
import { OfflineBanner } from '../ui/common';
import { CategoryIcon } from '../ui/icons';
import { Keypad, useCentsInput } from '../ui/Keypad';
import { Sheet, useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { Goals } from './Goals';

const BAR_COLOR = { ok: 'var(--accent)', warn: 'var(--accent)', full: 'var(--c3)', over: 'var(--ink)' } as const;

function BudgetTag({ b }: { b: BudgetDTO }) {
  const { hidden } = usePrivacy();
  if (b.status === 'over') {
    return <span className="tag tag-strong">Acima {hidden ? 'R$ ••••' : formatBRL(b.spentCents - b.limitCents)}</span>;
  }
  return <span className={`tag ${b.status === 'warn' ? '' : 'tag-muted'}`}>{Math.round(b.pct)}%</span>;
}

export function Budgets() {
  const { data, error } = useBudgets();
  const sheet = useSheet();
  const [editing, setEditing] = useState<BudgetDTO | null>(null);

  const openNew = () => {
    setEditing(null);
    sheet.open();
  };
  const openEdit = (b: BudgetDTO) => {
    setEditing(b);
    sheet.open();
  };

  const left = data ? Math.max(0, data.totalLimitCents - data.totalSpentCents) : 0;
  return (
    <main className="page">
      <div className="stack fu" style={{ gap: 6 }}>
        <h1 className="h1">Orçamentos</h1>
        {data && data.budgets.length > 0 && (
          <span className="muted" style={{ fontSize: 15 }}>
            Restam <Money cents={left} style={{ color: 'var(--ink)', fontWeight: 600 }} /> para {monthName(data.month)}
          </span>
        )}
      </div>
      <OfflineBanner />

      {error && !data && <p className="muted">Não foi possível carregar. {error.message}</p>}

      {data && data.budgets.length === 0 && (
        <div className="card-lg empty fu">
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Nenhum orçamento ainda</span>
          <span className="small">Defina um limite mensal por categoria e acompanhe o quanto já foi gasto.</span>
        </div>
      )}

      <div className="stack" style={{ gap: 12 }}>
        {data?.budgets.map((b, i) => (
          <button
            key={b.categoryId}
            type="button"
            className="card stack fu press"
            onClick={() => openEdit(b)}
            style={{ animationDelay: `${80 + i * 70}ms`, gap: 14, padding: 18, textAlign: 'left' }}
            aria-label={`${b.name}: editar orçamento`}
          >
            <div className="row" style={{ gap: 12, width: '100%' }}>
              <div className="tile tile-sm">
                <CategoryIcon icon={b.icon} size={18} />
              </div>
              <div className="item-main" style={{ gap: 2 }}>
                <span className="item-title">{b.name}</span>
                <span className="small muted">
                  <Money cents={b.spentCents} /> de <Money cents={b.limitCents} />
                </span>
              </div>
              <BudgetTag b={b} />
            </div>
            <div
              className="track"
              style={{ width: '100%' }}
              role="progressbar"
              aria-valuenow={Math.round(b.pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${b.name}: ${Math.round(b.pct)}% do orçamento`}
            >
              <div className="gx" style={{ width: `${Math.min(100, b.pct)}%`, background: BAR_COLOR[b.status], animationDelay: `${300 + i * 70}ms` }} />
            </div>
            {b.status !== 'over' && b.projectedCents > b.limitCents && (
              <span className="small muted">
                No ritmo atual: <Money cents={b.projectedCents} /> até o fim do mês
              </span>
            )}
          </button>
        ))}
      </div>

      {data && data.available.length > 0 && (
        <button type="button" className="btn fu" onClick={openNew} style={{ background: 'var(--surface)', color: 'var(--ink)' }}>
          <Plus size={20} strokeWidth={2} aria-hidden="true" />
          Novo orçamento
        </button>
      )}

      <Goals />

      <BudgetSheet state={sheet.state} onClose={sheet.close} editing={editing} available={data?.available ?? []} />
    </main>
  );
}

function BudgetSheet({
  state,
  onClose,
  editing,
  available,
}: {
  state: 'closed' | 'open' | 'closing';
  onClose: () => void;
  editing: BudgetDTO | null;
  available: CategoryDTO[];
}) {
  const { cents, setCents, press } = useCentsInput();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const save = useSetBudget();
  const remove = useDeleteBudget();
  const toast = useToast();

  useEffect(() => {
    if (state !== 'open') return;
    setCents(editing?.limitCents ?? 0);
    setCategoryId(editing?.categoryId ?? available[0]?.id ?? null);
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const name = editing?.name ?? available.find((c) => c.id === categoryId)?.name ?? '';
  const submit = () => {
    if (!cents || !categoryId) return;
    save.mutate(
      { categoryId, limitCents: cents },
      {
        onSuccess: () => {
          toast(`Orçamento de ${name} salvo`);
          onClose();
        },
      },
    );
  };

  return (
    <Sheet state={state} onClose={onClose} title={editing ? editing.name : 'Novo orçamento'}>
      <div className="stack" style={{ alignItems: 'center', gap: 6, padding: '8px 0' }}>
        <span className="num" style={{ fontSize: 52, fontWeight: 600, lineHeight: 1, color: cents ? 'var(--ink)' : 'var(--ink-4)' }} aria-live="polite">
          <span style={{ fontSize: 24, marginRight: 6, color: 'var(--ink-3)' }}>R$</span>
          {formatAmount(cents)}
        </span>
        <span className="small muted">Limite mensal{name ? ` · ${name}` : ''}</span>
      </div>

      {!editing && (
        <div className="chips" role="group" aria-label="Categoria">
          {available.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={c.id === categoryId} onClick={() => setCategoryId(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <Keypad onPress={press} />

      {save.error && (
        <p className="small" style={{ color: 'var(--danger)', textAlign: 'center' }}>
          {save.error.message}
        </p>
      )}
      <div className="stack" style={{ gap: 4 }}>
        <button type="button" className="btn" onClick={submit} disabled={!cents || !categoryId || save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar limite'}
        </button>
        {editing && (
          <button
            type="button"
            className="btn btn-danger"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(editing.categoryId, {
                onSuccess: () => {
                  toast(`Orçamento de ${editing.name} removido`);
                  onClose();
                },
              })
            }
          >
            Remover orçamento
          </button>
        )}
      </div>
    </Sheet>
  );
}
