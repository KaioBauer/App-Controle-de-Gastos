import type { CategoryDTO, TransactionDTO } from '@financas/shared';
import { formatBRL } from '@financas/shared';
import { Check } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Money } from '../lib/privacy';
import {
  useCategories,
  useDeleteTransaction,
  useRecategorize,
  useSimilar,
  useUpdateTransaction,
} from '../lib/queries';
import { Switch } from './common';
import { CategoryIcon } from './icons';
import { Sheet, useSheet } from './Sheet';
import { useToast } from './Toast';

const OpenTxContext = createContext<((tx: TransactionDTO) => void) | null>(null);

/** Abre os detalhes de uma transação de qualquer tela. */
export const useOpenTransaction = () => useContext(OpenTxContext);

export function TransactionSheetProvider({ children }: { children: ReactNode }) {
  const sheet = useSheet();
  const [tx, setTx] = useState<TransactionDTO | null>(null);
  const open = useCallback(
    (t: TransactionDTO) => {
      setTx(t);
      sheet.open();
    },
    [sheet.open],
  );
  return (
    <OpenTxContext.Provider value={open}>
      {children}
      <Sheet state={sheet.state} onClose={sheet.close} title="Transação">
        {tx && <TransactionDetails key={tx.id} tx={tx} onClose={sheet.close} onChange={setTx} />}
      </Sheet>
    </OpenTxContext.Provider>
  );
}

const fullDate = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Categorias que fazem sentido para o sinal da transação (transferência serve para os dois). */
function categoriesFor(all: CategoryDTO[], amountCents: number) {
  const primary = amountCents < 0 ? 'EXPENSE' : 'INCOME';
  return [...all.filter((c) => c.kind === primary), ...all.filter((c) => c.kind === 'TRANSFER'), ...all.filter((c) => c.kind !== primary && c.kind !== 'TRANSFER')];
}

function TransactionDetails({ tx, onClose, onChange }: { tx: TransactionDTO; onClose: () => void; onChange: (t: TransactionDTO) => void }) {
  const toast = useToast();
  const { data: categories = [] } = useCategories();
  const similar = useSimilar(tx.id);
  const recategorize = useRecategorize();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();

  const [categoryId, setCategoryId] = useState(tx.category?.id ?? null);
  const [applyToSimilar, setApplyToSimilar] = useState(true);
  const [createRule, setCreateRule] = useState(true);
  const [notes, setNotes] = useState(tx.notes ?? '');
  const [tags, setTags] = useState(tx.tags.join(', '));
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setCategoryId(tx.category?.id ?? null), [tx.category?.id]);

  const categoryChanged = categoryId !== (tx.category?.id ?? null);
  // Mesma normalização do servidor (minúsculas, sem repetição) para comparar com o salvo
  const parsedTags = [
    ...new Set(
      tags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const notesChanged = notes.trim() !== (tx.notes ?? '') || parsedTags.join(',') !== tx.tags.join(',');
  const similarCount = similar.data?.count ?? 0;
  // Mesma regra da lista: transferência entre contas não é entrada nem gasto
  const income = tx.amountCents > 0 && !tx.isTransfer;

  const saveCategory = () => {
    if (!categoryId) return;
    recategorize.mutate(
      { id: tx.id, categoryId, applyToSimilar: applyToSimilar && similarCount > 0, createRule },
      {
        onSuccess: (r) => {
          onChange(r.transaction);
          const extra = [r.similarUpdated ? `${r.similarUpdated} parecidas` : '', r.ruleCreated ? 'regra salva' : ''].filter(Boolean).join(' · ');
          toast(`Categoria atualizada${extra ? ` (${extra})` : ''}`);
        },
      },
    );
  };

  const saveNotes = () =>
    update.mutate(
      { id: tx.id, notes: notes.trim() || null, tags: parsedTags },
      {
        onSuccess: (t) => {
          onChange(t);
          setNotes(t.notes ?? '');
          setTags(t.tags.join(', '));
          toast('Notas salvas');
        },
      },
    );

  const markReviewed = () =>
    update.mutate(
      { id: tx.id, reviewed: true },
      {
        onSuccess: (t) => {
          onChange(t);
          toast('Marcada como revisada');
        },
      },
    );

  const meta = [
    tx.accountName,
    fullDate.format(new Date(`${tx.localDate}T00:00:00Z`)),
    tx.installment ? `parcela ${tx.installment.number}/${tx.installment.total}` : '',
    tx.status === 'PENDING' ? 'pendente' : '',
  ].filter(Boolean);

  return (
    <>
      <div className="stack" style={{ alignItems: 'center', gap: 6, padding: '4px 0', textAlign: 'center' }}>
        <Money
          cents={tx.amountCents}
          sign="auto"
          style={{ fontSize: 40, fontWeight: 600, lineHeight: 1, color: income ? 'var(--positive)' : tx.isTransfer ? 'var(--ink-2)' : 'var(--ink)' }}
        />
        <span style={{ fontSize: 16, fontWeight: 500 }}>{tx.description}</span>
        <span className="small muted">{meta.join(' · ')}</span>
        {tx.isTransfer && (
          <span className="tag tag-muted">Transferência: não conta como {tx.amountCents > 0 ? 'entrada' : 'gasto'}</span>
        )}
      </div>

      <section className="stack" style={{ gap: 10 }} aria-label="Categoria">
        <h3 className="small muted" style={{ margin: 0, fontWeight: 500 }}>
          Categoria
        </h3>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }} role="group">
          {categoriesFor(categories, tx.amountCents).map((c) => (
            <button key={c.id} type="button" className="chip row" style={{ gap: 6 }} aria-pressed={c.id === categoryId} onClick={() => setCategoryId(c.id)}>
              <CategoryIcon icon={c.icon} size={16} />
              {c.name}
            </button>
          ))}
        </div>

        {categoryChanged && (
          <div className="stack fu" style={{ gap: 4, background: 'var(--fill)', borderRadius: 18, padding: 6 }}>
            {similarCount > 0 && (
              <button type="button" className="item" role="switch" aria-checked={applyToSimilar} onClick={() => setApplyToSimilar((v) => !v)}>
                <span className="item-main">
                  <span className="item-title">Aplicar a {similarCount} parecidas</span>
                  <span className="item-sub">Mesmo estabelecimento, que você não mudou à mão</span>
                </span>
                <Switch checked={applyToSimilar} />
              </button>
            )}
            <button type="button" className="item" role="switch" aria-checked={createRule} onClick={() => setCreateRule((v) => !v)}>
              <span className="item-main">
                <span className="item-title">Sempre usar para este estabelecimento</span>
                <span className="item-sub">Vale para as próximas transações sincronizadas</span>
              </span>
              <Switch checked={createRule} />
            </button>
            <button type="button" className="btn" onClick={saveCategory} disabled={recategorize.isPending}>
              {recategorize.isPending ? 'Salvando…' : 'Salvar categoria'}
            </button>
            {recategorize.error && <p className="small" style={{ color: 'var(--danger)', padding: '0 8px' }}>{recategorize.error.message}</p>}
          </div>
        )}
        {!categoryChanged && similar.data?.rule && (
          <span className="small muted">Regra ativa: este estabelecimento vai sempre para {similar.data.rule.category.name}.</span>
        )}
      </section>

      <section className="stack" style={{ gap: 10 }} aria-label="Notas e tags">
        <label className="small muted" htmlFor="tx-notes" style={{ fontWeight: 500 }}>
          Notas
        </label>
        <textarea
          id="tx-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Ex.: presente de aniversário"
          style={{ border: 0, borderRadius: 18, background: 'var(--fill)', padding: '14px 16px', fontFamily: 'inherit', fontSize: 16, resize: 'none', outline: 'none' }}
        />
        <label className="small muted" htmlFor="tx-tags" style={{ fontWeight: 500 }}>
          Tags (separadas por vírgula)
        </label>
        <input
          id="tx-tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="viagem, trabalho"
          autoCapitalize="none"
          style={{ height: 50, border: 0, borderRadius: 18, background: 'var(--fill)', padding: '0 16px', fontSize: 16, outline: 'none' }}
        />
        {notesChanged && (
          <button type="button" className="btn" onClick={saveNotes} disabled={update.isPending}>
            Salvar notas
          </button>
        )}
      </section>

      <div className="stack" style={{ gap: 4 }}>
        {!tx.reviewed && (
          <button type="button" className="btn" style={{ background: 'var(--fill)', color: 'var(--ink)' }} onClick={markReviewed} disabled={update.isPending}>
            <Check size={18} strokeWidth={2.2} aria-hidden="true" />
            Marcar como revisada
          </button>
        )}
        {tx.manual &&
          (confirmDelete ? (
            <div className="stack" style={{ gap: 4 }}>
              <button
                type="button"
                className="btn"
                style={{ background: 'var(--danger)', color: '#fff' }}
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(tx.id, {
                    onSuccess: () => {
                      toast(`Lançamento de ${formatBRL(Math.abs(tx.amountCents))} apagado`);
                      onClose();
                    },
                  })
                }
              >
                Apagar de vez
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              Apagar lançamento
            </button>
          ))}
      </div>
    </>
  );
}
