import { formatAmount, formatBRL } from '@financas/shared';
import { useEffect, useState } from 'react';
import { useCategories, useCreateTransaction } from '../lib/queries';
import { Keypad, useCentsInput } from './Keypad';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

interface Props {
  state: 'closed' | 'open' | 'closing';
  onClose: () => void;
  onSaved?: () => void;
}

/** Lançamento manual (dinheiro em espécie): gasto ou entrada, com teclado numérico. */
export function NewExpenseSheet({ state, onClose, onSaved }: Props) {
  const { data: categories } = useCategories();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const kindCats = categories?.filter((c) => c.kind === (kind === 'expense' ? 'EXPENSE' : 'INCOME')) ?? [];
  const { cents, setCents, press } = useCentsInput();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const create = useCreateTransaction();
  const toast = useToast();

  // Cada abertura começa do zero
  useEffect(() => {
    if (state === 'open') {
      setCents(0);
      setKind('expense');
      setCategoryId(null);
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const selected = kindCats.find((c) => c.id === categoryId) ?? kindCats[0];

  const save = () => {
    if (!cents || !selected) return;
    create.mutate(
      { amountCents: cents, categoryId: selected.id, kind },
      {
        onSuccess: () => {
          toast(kind === 'expense' ? `Gasto de ${formatBRL(cents)} adicionado` : `Entrada de ${formatBRL(cents)} adicionada`);
          onClose();
          onSaved?.();
        },
      },
    );
  };

  return (
    <Sheet state={state} onClose={onClose} title={kind === 'expense' ? 'Novo gasto' : 'Nova entrada'}>
      <div className="segmented" role="group" aria-label="Tipo">
        <div className="seg-i" style={{ width: 'calc(50% - 4px)', transform: kind === 'income' ? 'translateX(100%)' : 'none' }} />
        {(['expense', 'income'] as const).map((k) => (
          <button
            key={k}
            type="button"
            className="seg"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setCategoryId(null);
            }}
          >
            {k === 'expense' ? 'Gasto' : 'Entrada'}
          </button>
        ))}
      </div>
      <div className="stack" style={{ alignItems: 'center', gap: 6, padding: '8px 0' }}>
        <span className="num" style={{ fontSize: 52, fontWeight: 600, lineHeight: 1, color: !cents ? 'var(--ink-4)' : kind === 'income' ? 'var(--positive)' : 'var(--ink)', transition: 'color .2s ease' }} aria-live="polite">
          <span style={{ fontSize: 24, marginRight: 6, color: 'var(--ink-3)' }}>R$</span>
          {formatAmount(cents)}
        </span>
        <span className="small muted">Hoje · {selected?.name ?? '…'}</span>
      </div>

      <div className="chips" role="group" aria-label="Categoria">
        {kindCats.map((c) => (
          <button key={c.id} type="button" className="chip" aria-pressed={c.id === selected?.id} onClick={() => setCategoryId(c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      <Keypad onPress={press} />

      {create.error && (
        <p className="small" style={{ color: 'var(--danger)', textAlign: 'center' }}>
          {create.error.message}
        </p>
      )}
      <button type="button" className="btn" onClick={save} disabled={!cents || !selected || create.isPending}>
        {create.isPending ? 'Salvando…' : kind === 'expense' ? 'Adicionar gasto' : 'Adicionar entrada'}
      </button>
    </Sheet>
  );
}
