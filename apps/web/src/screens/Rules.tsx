import { Trash2 } from 'lucide-react';
import { useDeleteRule, useRules } from '../lib/queries';
import { OfflineBanner, PageHeader } from '../ui/common';
import { CategoryIcon } from '../ui/icons';
import { useToast } from '../ui/Toast';

/** Regras "sempre categorizar este estabelecimento como…", criadas ao trocar a categoria de uma transação. */
export function Rules() {
  const { data, error } = useRules();
  const remove = useDeleteRule();
  const toast = useToast();

  return (
    <main className="page">
      <PageHeader
        title="Regras"
        back="/ajustes"
        subtitle="Categorias automáticas para as próximas transações sincronizadas."
      />
      <OfflineBanner />

      {error && !data && <p className="muted">Não foi possível carregar. {error.message}</p>}
      {data && data.length === 0 && (
        <div className="card-lg empty">
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Nenhuma regra ainda</span>
          <span className="small">
            Toque numa transação, troque a categoria e deixe ligado “Sempre usar para este estabelecimento”.
          </span>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="list fu">
          {data.map((r) => (
            <div key={r.id} className="item">
              <div className="tile">
                <CategoryIcon icon={r.category.icon} />
              </div>
              <div className="item-main">
                <span className="item-title">{r.label}</span>
                <span className="item-sub">
                  {r.category.name} · {r.matches} {r.matches === 1 ? 'transação' : 'transações'}
                </span>
              </div>
              <button
                type="button"
                className="round-btn press"
                style={{ background: 'var(--fill)', color: 'var(--danger)' }}
                aria-label={`Remover regra de ${r.label}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(r.id, { onSuccess: () => toast('Regra removida') })}
              >
                <Trash2 size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      {data && data.length > 0 && (
        <p className="small muted" style={{ padding: '0 8px', lineHeight: 1.45 }}>
          Remover uma regra não muda as transações já categorizadas; só as próximas voltam para a categoria automática.
        </p>
      )}
    </main>
  );
}
