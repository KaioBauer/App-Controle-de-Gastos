import type { GoalDTO } from '@financas/shared';
import { formatAmount, formatBRL, toCents } from '@financas/shared';
import { Plus, Target, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Money, usePrivacy } from '../lib/privacy';
import { useGoalAction, useGoals } from '../lib/queries';
import { Keypad, useCentsInput } from '../ui/Keypad';
import { Sheet, useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

const monthYear = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtMonth = (ymd: string) => monthYear.format(new Date(`${ymd}T12:00:00Z`)).replace('.', '').replace(' de ', '/');
const fmtDay = (ymd: string) => dayMonth.format(new Date(`${ymd}T12:00:00Z`)).replace('.', '').replace(' de ', ' ');

const STATUS: Record<GoalDTO['status'], { label: string; cls: string }> = {
  done: { label: 'Concluída', cls: '' },
  'on-track': { label: 'No ritmo', cls: '' },
  behind: { label: 'Abaixo do ritmo', cls: 'tag-strong' },
  late: { label: 'Prazo passou', cls: 'tag-strong' },
  'no-deadline': { label: 'Sem prazo', cls: 'tag-muted' },
  new: { label: 'Comece a guardar', cls: 'tag-muted' },
};

function goalHint(g: GoalDTO, hidden: boolean) {
  const m = (c: number) => (hidden ? 'R$ ••••' : formatBRL(c));
  if (g.status === 'done') return 'Meta atingida 🎉';
  if (g.status === 'no-deadline') return `Faltam ${m(g.remainingCents)}`;
  if (g.status === 'late') return `Faltam ${m(g.remainingCents)} · o prazo era ${fmtMonth(g.deadline!)}`;
  return `Guarde ${m(g.perMonthCents!)}/mês até ${fmtMonth(g.deadline!)}`;
}

/** Seção de metas de economia (aba Orçamentos). */
export function Goals() {
  const { data } = useGoals();
  const { hidden } = usePrivacy();
  const detail = useSheet();
  const form = useSheet();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<GoalDTO | null>(null);
  const selected = data?.find((g) => g.id === selectedId) ?? null;

  return (
    <section className="stack" style={{ gap: 12 }} aria-label="Metas">
      <div className="section-title">
        <h2 className="h2">Metas</h2>
      </div>
      {data && data.length === 0 && (
        <div className="card-lg empty fu">
          <Target size={32} strokeWidth={1.5} aria-hidden="true" />
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Nenhuma meta ainda</span>
          <span className="small">Viagem, reserva de emergência, um celular novo… defina o valor e o prazo.</span>
        </div>
      )}
      {data?.map((g, i) => (
        <button
          key={g.id}
          type="button"
          className="card stack fu press"
          style={{ gap: 12, padding: 18, textAlign: 'left', animationDelay: `${i * 70}ms` }}
          onClick={() => {
            setSelectedId(g.id);
            detail.open();
          }}
          aria-label={`${g.name}: abrir meta`}
        >
          <div className="row" style={{ gap: 12, width: '100%' }}>
            <div className="tile tile-sm tile-accent">
              <Target size={18} strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div className="item-main" style={{ gap: 2 }}>
              <span className="item-title">{g.name}</span>
              <span className="small muted">
                <Money cents={g.savedCents} /> de <Money cents={g.targetCents} />
              </span>
            </div>
            <span className={`tag ${STATUS[g.status].cls}`}>{STATUS[g.status].label}</span>
          </div>
          <div className="track" style={{ width: '100%' }} role="progressbar" aria-valuenow={Math.round(g.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.name}: ${Math.round(g.pct)}%`}>
            <div className="gx" style={{ width: `${g.pct}%` }} />
          </div>
          <span className="small muted">{goalHint(g, hidden)}</span>
        </button>
      ))}
      <button
        type="button"
        className="btn fu"
        style={{ background: 'var(--surface)', color: 'var(--ink)' }}
        onClick={() => {
          setEditing(null);
          form.open();
        }}
      >
        <Plus size={20} strokeWidth={2} aria-hidden="true" />
        Nova meta
      </button>

      <Sheet state={detail.state} onClose={detail.close} title={selected?.name ?? 'Meta'}>
        {selected && (
          <GoalDetail
            goal={selected}
            onEdit={() => {
              setEditing(selected);
              detail.close();
              form.open();
            }}
          />
        )}
      </Sheet>
      <Sheet state={form.state} onClose={form.close} title={editing ? 'Editar meta' : 'Nova meta'}>
        <GoalForm key={editing?.id ?? 'new'} goal={editing} onDone={form.close} />
      </Sheet>
    </section>
  );
}

function GoalDetail({ goal, onEdit }: { goal: GoalDTO; onEdit: () => void }) {
  const [kind, setKind] = useState<'deposit' | 'withdraw'>('deposit');
  const { cents, setCents, press } = useCentsInput();
  const action = useGoalAction();
  const toast = useToast();
  const { hidden } = usePrivacy();

  const submit = () =>
    action.mutate(
      { type: 'contribute', id: goal.id, amountCents: cents, kind },
      {
        onSuccess: () => {
          toast(kind === 'deposit' ? `${formatBRL(cents)} guardados em ${goal.name}` : `${formatBRL(cents)} retirados de ${goal.name}`);
          setCents(0);
        },
      },
    );

  return (
    <>
      <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
        <span className="small muted">Guardado</span>
        <Money cents={goal.savedCents} style={{ fontSize: 40, fontWeight: 600, lineHeight: 1 }} />
        <span className="small muted">
          de <Money cents={goal.targetCents} /> · {goalHint(goal, hidden)}
        </span>
      </div>

      <div className="segmented" role="group" aria-label="Tipo de movimento">
        <div className="seg-i" style={{ width: 'calc(50% - 4px)', transform: kind === 'deposit' ? 'none' : 'translateX(100%)' }} />
        <button type="button" className="seg" aria-pressed={kind === 'deposit'} onClick={() => setKind('deposit')}>
          Guardar
        </button>
        <button type="button" className="seg" aria-pressed={kind === 'withdraw'} onClick={() => setKind('withdraw')}>
          Retirar
        </button>
      </div>
      <div className="stack" style={{ alignItems: 'center' }}>
        <span className="num" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1, color: cents ? 'var(--ink)' : 'var(--ink-4)' }} aria-live="polite">
          <span style={{ fontSize: 20, marginRight: 6, color: 'var(--ink-3)' }}>R$</span>
          {formatAmount(cents)}
        </span>
      </div>
      <Keypad onPress={press} />
      {action.error && <p className="small" style={{ color: 'var(--danger)', textAlign: 'center' }}>{action.error.message}</p>}
      <button type="button" className="btn" disabled={!cents || action.isPending} onClick={submit}>
        {kind === 'deposit' ? 'Guardar' : 'Retirar'}
      </button>

      {goal.contributions.length > 0 && (
        <section className="stack" style={{ gap: 6 }} aria-label="Histórico">
          <h3 className="small muted" style={{ margin: 0, fontWeight: 500 }}>
            Histórico
          </h3>
          {goal.contributions.slice(0, 10).map((c) => (
            <div key={c.id} className="row" style={{ gap: 10, padding: '6px 0' }}>
              <span className="item-main small">{fmtDay(c.localDate)}</span>
              <Money cents={c.amountCents} sign="auto" className="small" style={{ fontWeight: 600, color: c.amountCents > 0 ? 'var(--positive)' : 'var(--ink)' }} />
              <button
                type="button"
                className="round-btn press"
                style={{ background: 'var(--fill)', width: 36, height: 36 }}
                aria-label="Desfazer este movimento"
                onClick={() => action.mutate({ type: 'undo', id: goal.id, contributionId: c.id })}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
        </section>
      )}
      <button type="button" className="btn btn-ghost" onClick={onEdit}>
        Editar meta
      </button>
    </>
  );
}

function GoalForm({ goal, onDone }: { goal: GoalDTO | null; onDone: () => void }) {
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? formatAmount(goal.targetCents) : '');
  const [hasDeadline, setHasDeadline] = useState(goal ? !!goal.deadline : true);
  const [deadline, setDeadline] = useState(goal?.deadline ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const action = useGoalAction();
  const toast = useToast();
  useEffect(() => setError(null), [name, target, deadline]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    let targetCents: number;
    try {
      targetCents = toCents(target);
    } catch {
      return setError('Valor inválido');
    }
    if (targetCents <= 0) return setError('Valor inválido');
    if (hasDeadline && !deadline) return setError('Escolha a data do prazo');
    action.mutate(
      { type: 'save', id: goal?.id, name: name.trim(), targetCents, deadline: hasDeadline ? deadline : null },
      {
        onSuccess: () => {
          toast(goal ? 'Meta atualizada' : 'Meta criada');
          onDone();
        },
      },
    );
  };

  const input = { height: 50, border: 0, borderRadius: 16, background: 'var(--fill)', padding: '0 16px', fontSize: 16, outline: 'none', width: '100%' } as const;
  return (
    <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
      <label className="stack small muted" style={{ gap: 6 }}>
        Nome
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Ex.: Viagem de férias" style={input} />
      </label>
      <label className="stack small muted" style={{ gap: 6 }}>
        Valor da meta
        <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" required placeholder="0,00" style={input} />
      </label>
      <div className="segmented" role="group" aria-label="Prazo">
        <div className="seg-i" style={{ width: 'calc(50% - 4px)', transform: hasDeadline ? 'none' : 'translateX(100%)' }} />
        <button type="button" className="seg" aria-pressed={hasDeadline} onClick={() => setHasDeadline(true)}>
          Com prazo
        </button>
        <button type="button" className="seg" aria-pressed={!hasDeadline} onClick={() => setHasDeadline(false)}>
          Sem prazo
        </button>
      </div>
      {hasDeadline && (
        <label className="stack small muted" style={{ gap: 6 }}>
          Até quando
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={input} />
        </label>
      )}
      {(error || action.error) && <p className="small" style={{ color: 'var(--danger)' }}>{error ?? action.error!.message}</p>}
      <div className="stack" style={{ gap: 4 }}>
        <button type="submit" className="btn" disabled={!name.trim() || action.isPending}>
          {goal ? 'Salvar' : 'Criar meta'}
        </button>
        {goal &&
          (confirmDelete ? (
            <button
              type="button"
              className="btn"
              style={{ background: 'var(--danger)', color: '#fff' }}
              onClick={() => action.mutate({ type: 'delete', id: goal.id }, { onSuccess: () => { toast('Meta excluída'); onDone(); } })}
            >
              Excluir de vez
            </button>
          ) : (
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              Excluir meta
            </button>
          ))}
      </div>
    </form>
  );
}
