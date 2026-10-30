import type { CategoryDTO } from '@financas/shared';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useCategories, useCategoryAction } from '../lib/queries';
import { OfflineBanner, PageHeader } from '../ui/common';
import { CATEGORY_ICONS, CategoryIcon } from '../ui/icons';
import { Sheet, useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

/** Ícones oferecidos ao criar/editar (sem os reservados para entrada/transferência) */
const PICKABLE = Object.keys(CATEGORY_ICONS).filter((k) => k !== 'income' && k !== 'transfer');

export function Categories() {
  const { data = [], error } = useCategories();
  const sheet = useSheet();
  const [editing, setEditing] = useState<CategoryDTO | null>(null);
  const [newKind, setNewKind] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');

  const groups: { label: string; kind: 'EXPENSE' | 'INCOME' }[] = [
    { label: 'Gastos', kind: 'EXPENSE' },
    { label: 'Entradas', kind: 'INCOME' },
  ];

  return (
    <main className="page">
      <PageHeader title="Categorias" back="/ajustes" subtitle="Renomeie, troque o ícone ou crie as suas." />
      <OfflineBanner />
      {error && <p className="muted">Não foi possível carregar. {error.message}</p>}

      {groups.map((g) => (
        <section key={g.kind} className="stack" style={{ gap: 10 }}>
          <h2 className="small muted" style={{ fontWeight: 500, paddingLeft: 4 }}>
            {g.label}
          </h2>
          <div className="list fu">
            {data
              .filter((c) => c.kind === g.kind)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="item"
                  onClick={() => {
                    setEditing(c);
                    sheet.open();
                  }}
                >
                  <div className="tile">
                    <CategoryIcon icon={c.icon} />
                  </div>
                  <div className="item-main">
                    <span className="item-title">{c.name}</span>
                    {c.isDefault && <span className="item-sub">Padrão</span>}
                  </div>
                </button>
              ))}
            <button
              type="button"
              className="item"
              onClick={() => {
                setEditing(null);
                setNewKind(g.kind);
                sheet.open();
              }}
            >
              <div className="tile tile-accent">
                <Plus size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <span className="item-main">
                <span className="item-title">Nova categoria de {g.label.toLowerCase()}</span>
              </span>
            </button>
          </div>
        </section>
      ))}
      <p className="small muted" style={{ padding: '0 8px', lineHeight: 1.45 }}>
        As categorias padrão são usadas na classificação automática das transações do banco: dá para renomear, mas não excluir.
      </p>

      <Sheet state={sheet.state} onClose={sheet.close} title={editing ? 'Editar categoria' : 'Nova categoria'}>
        <CategoryForm key={editing?.id ?? `new-${newKind}`} category={editing} kind={newKind} onDone={sheet.close} />
      </Sheet>
    </main>
  );
}

function CategoryForm({ category, kind, onDone }: { category: CategoryDTO | null; kind: 'EXPENSE' | 'INCOME'; onDone: () => void }) {
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? 'other');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const action = useCategoryAction();
  const toast = useToast();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const done = () => {
      toast(category ? 'Categoria atualizada' : 'Categoria criada');
      onDone();
    };
    if (category) action.mutate({ type: 'update', id: category.id, name: name.trim(), icon }, { onSuccess: done });
    else action.mutate({ type: 'create', name: name.trim(), icon, kind }, { onSuccess: done });
  };

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 12 }}>
        <div className="tile tile-accent" style={{ width: 52, height: 52, borderRadius: 16 }}>
          <CategoryIcon icon={icon} size={24} />
        </div>
        <label className="stack small muted" style={{ gap: 6, flex: 1 }}>
          Nome
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={40}
            placeholder="Ex.: Pet"
            style={{ height: 50, border: 0, borderRadius: 16, background: 'var(--fill)', padding: '0 16px', fontSize: 16, outline: 'none' }}
          />
        </label>
      </div>
      <div className="stack small muted" style={{ gap: 8 }}>
        Ícone
        <div role="radiogroup" aria-label="Ícone" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))', gap: 8 }}>
          {PICKABLE.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={icon === k}
              aria-label={k}
              onClick={() => setIcon(k)}
              className="press"
              style={{
                height: 48,
                borderRadius: 14,
                display: 'grid',
                placeItems: 'center',
                background: icon === k ? 'var(--ink)' : 'var(--fill)',
                color: icon === k ? 'var(--bg)' : 'var(--ink)',
              }}
            >
              <CategoryIcon icon={k} />
            </button>
          ))}
        </div>
      </div>
      {action.error && <p className="small" style={{ color: 'var(--danger)' }}>{action.error.message}</p>}
      <div className="stack" style={{ gap: 4 }}>
        <button type="submit" className="btn" disabled={!name.trim() || action.isPending}>
          {category ? 'Salvar' : 'Criar categoria'}
        </button>
        {category &&
          !category.isDefault &&
          (confirmDelete ? (
            <button
              type="button"
              className="btn"
              style={{ background: 'var(--danger)', color: '#fff' }}
              onClick={() =>
                action.mutate(
                  { type: 'delete', id: category.id },
                  {
                    onSuccess: (r) => {
                      const n = r.uncategorized ?? 0;
                      toast(n ? `Categoria excluída · ${n} transações ficaram sem categoria` : 'Categoria excluída');
                      onDone();
                    },
                  },
                )
              }
            >
              Excluir de vez
            </button>
          ) : (
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              Excluir categoria
            </button>
          ))}
      </div>
    </form>
  );
}
