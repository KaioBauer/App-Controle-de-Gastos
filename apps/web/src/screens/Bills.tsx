import type { BillDTO, BillStatus, BillSuggestionDTO, UpcomingDTO } from '@financas/shared';
import { formatAmount, localDate, toCents } from '@financas/shared';
import { Check, Plus, Sparkles } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Money } from '../lib/privacy';
import { useBillAction, useBills, useCategories, useSaveBill, type BillInput } from '../lib/queries';
import { OfflineBanner, PageHeader } from '../ui/common';
import { CategoryIcon } from '../ui/icons';
import { Sheet, useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const fmtDue = (ymd: string) => dayMonth.format(new Date(`${ymd}T12:00:00Z`)).replace('.', '').replace(' de ', ' ');

/** "vence hoje", "vence em 3 dias", "venceu há 2 dias" */
export function dueLabel(dueDate: string, status: BillStatus, today = localDate(new Date())) {
  if (status === 'paid') return 'paga';
  const days = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return 'vence hoje';
  if (days === 1) return 'vence amanhã';
  if (days > 1) return `vence em ${days} dias`;
  return days === -1 ? 'venceu ontem' : `venceu há ${-days} dias`;
}

export function UpcomingRow({ u, onClick }: { u: UpcomingDTO; onClick?: () => void }) {
  const late = u.status === 'overdue';
  const content = (
    <>
      <div className="tile">
        <CategoryIcon icon={u.icon} />
      </div>
      <div className="item-main">
        <span className="item-title">{u.name}</span>
        <span className="item-sub" style={late ? { color: 'var(--danger)' } : undefined}>
          {fmtDue(u.dueDate)} · {dueLabel(u.dueDate, u.status)}
        </span>
      </div>
      {u.amountCents != null ? <Money cents={u.amountCents} className="item-amt" /> : <span className="small muted">valor varia</span>}
    </>
  );
  return onClick ? (
    <button type="button" className="item" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="item">{content}</div>
  );
}

export function Bills() {
  const { data, error } = useBills();
  const formSheet = useSheet();
  const paySheet = useSheet();
  const [editing, setEditing] = useState<BillDTO | null>(null);
  const [draft, setDraft] = useState<BillInput | null>(null);
  const [paying, setPaying] = useState<UpcomingDTO | null>(null);
  const action = useBillAction();
  const toast = useToast();

  const openNew = (from?: BillSuggestionDTO) => {
    setEditing(null);
    setDraft(
      from
        ? { name: from.name, amountCents: from.amountCents, dueDay: from.dueDay, dueDate: null, categoryId: from.category?.id ?? null, matchKey: from.matchKey }
        : null,
    );
    formSheet.open();
  };

  return (
    <main className="page">
      <PageHeader title="Contas" back="/" subtitle="Contas a pagar e pagamentos recorrentes" />
      <OfflineBanner />
      {error && !data && <p className="muted">Não foi possível carregar. {error.message}</p>}

      {data && data.upcoming.length > 0 && (
        <section className="stack" style={{ gap: 10 }}>
          <h2 className="h2">Próximas</h2>
          <div className="list fu">
            {data.upcoming.map((u) => (
              <UpcomingRow
                key={u.key}
                u={u}
                onClick={
                  u.kind === 'bill'
                    ? () => {
                        setPaying(u);
                        paySheet.open();
                      }
                    : undefined
                }
              />
            ))}
          </div>
          <p className="small muted" style={{ padding: '0 8px' }}>
            Contas com baixa automática são marcadas como pagas quando o pagamento aparece no extrato.
          </p>
        </section>
      )}

      {data && data.suggestions.length > 0 && (
        <section className="stack" style={{ gap: 10 }}>
          <h2 className="h2 row" style={{ gap: 8 }}>
            <Sparkles size={18} aria-hidden="true" />
            Parecem recorrentes
          </h2>
          <div className="list fu">
            {data.suggestions.map((s) => (
              <div key={s.matchKey} className="item" style={{ flexWrap: 'wrap', rowGap: 10 }}>
                <div className="tile">
                  <CategoryIcon icon={s.category?.icon} />
                </div>
                <div className="item-main">
                  <span className="item-title">{s.name}</span>
                  <span className="item-sub">
                    Todo mês, por volta do dia {s.dueDay} · <Money cents={s.amountCents} />
                  </span>
                </div>
                <div className="row" style={{ gap: 8, width: '100%', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="chip"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ type: 'dismiss', key: s.matchKey }, { onSuccess: () => toast('Sugestão dispensada') })}
                  >
                    Dispensar
                  </button>
                  <button type="button" className="chip" aria-pressed="true" onClick={() => openNew(s)}>
                    Adicionar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {data && (
        <section className="stack" style={{ gap: 10 }}>
          <h2 className="h2">Suas contas</h2>
          {data.bills.length === 0 ? (
            <div className="card-lg empty">
              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Nenhuma conta cadastrada</span>
              <span className="small">Cadastre aluguel, internet, escola… e receba aviso antes do vencimento.</span>
            </div>
          ) : (
            <div className="list fu">
              {data.bills.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="item"
                  onClick={() => {
                    setEditing(b);
                    setDraft(null);
                    formSheet.open();
                  }}
                >
                  <div className="tile">
                    <CategoryIcon icon={b.category?.icon ?? 'home'} />
                  </div>
                  <div className="item-main">
                    <span className="item-title">{b.name}</span>
                    <span className="item-sub">
                      {b.dueDay ? `Todo dia ${b.dueDay}` : `Em ${fmtDue(b.dueDate!)}`}
                      {b.autoMatch ? ' · baixa automática' : ''}
                    </span>
                  </div>
                  {b.amountCents != null ? <Money cents={b.amountCents} className="item-amt" /> : <span className="small muted">varia</span>}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="btn" onClick={() => openNew()}>
            <Plus size={20} strokeWidth={2} aria-hidden="true" />
            Nova conta
          </button>
        </section>
      )}

      <Sheet state={formSheet.state} onClose={formSheet.close} title={editing ? editing.name : 'Nova conta'}>
        <BillForm key={(editing?.id ?? 'new') + (draft?.matchKey ?? '')} bill={editing} draft={draft} onDone={formSheet.close} />
      </Sheet>

      <Sheet state={paySheet.state} onClose={paySheet.close} title={paying?.name ?? 'Conta'}>
        {paying && (
          <>
            <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
              {paying.amountCents != null && <Money cents={paying.amountCents} style={{ fontSize: 40, fontWeight: 600, lineHeight: 1 }} />}
              <span className="small muted">
                {fmtDue(paying.dueDate)} · {dueLabel(paying.dueDate, paying.status)}
              </span>
            </div>
            <button
              type="button"
              className="btn"
              disabled={action.isPending}
              onClick={() =>
                action.mutate(
                  { type: 'pay', id: paying.billId!, period: paying.period },
                  {
                    onSuccess: () => {
                      toast(`${paying.name} marcada como paga`);
                      paySheet.close();
                    },
                  },
                )
              }
            >
              <Check size={18} strokeWidth={2.2} aria-hidden="true" />
              Marcar como paga
            </button>
          </>
        )}
      </Sheet>
    </main>
  );
}

function BillForm({ bill, draft, onDone }: { bill: BillDTO | null; draft: BillInput | null; onDone: () => void }) {
  const { data: categories = [] } = useCategories();
  const expenseCats = categories.filter((c) => c.kind === 'EXPENSE');
  const save = useSaveBill();
  const action = useBillAction();
  const toast = useToast();
  const initial = bill ?? draft;

  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.amountCents != null ? formatAmount(initial.amountCents) : '');
  const [monthly, setMonthly] = useState(initial ? !!initial.dueDay : true);
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? 10));
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? localDate(new Date()));
  const [categoryId, setCategoryId] = useState<string | null>(bill?.category?.id ?? draft?.categoryId ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => setFormError(null), [name, amount, dueDay, dueDate]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    let amountCents: number | null = null;
    if (amount.trim()) {
      try {
        amountCents = toCents(amount);
      } catch {
        return setFormError('Valor inválido');
      }
      if (amountCents <= 0) return setFormError('Valor inválido');
    }
    const day = Number(dueDay);
    if (monthly && !(day >= 1 && day <= 31)) return setFormError('Dia do vencimento entre 1 e 31');
    save.mutate(
      {
        id: bill?.id,
        name: name.trim(),
        amountCents,
        dueDay: monthly ? day : null,
        dueDate: monthly ? null : dueDate,
        categoryId,
        matchKey: draft?.matchKey ?? null,
      },
      {
        onSuccess: () => {
          toast(bill ? 'Conta atualizada' : 'Conta adicionada');
          onDone();
        },
      },
    );
  };

  const inputStyle = { height: 50, border: 0, borderRadius: 16, background: 'var(--fill)', padding: '0 16px', fontSize: 16, outline: 'none', width: '100%' } as const;

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
      <label className="stack small muted" style={{ gap: 6 }}>
        Nome
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Ex.: Aluguel" style={inputStyle} />
      </label>
      <label className="stack small muted" style={{ gap: 6 }}>
        Valor (deixe vazio se variar, como luz)
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" style={inputStyle} />
      </label>

      <div className="segmented" role="group" aria-label="Frequência">
        <div className="seg-i" style={{ width: 'calc(50% - 4px)', transform: monthly ? 'none' : 'translateX(100%)' }} />
        <button type="button" className="seg" aria-pressed={monthly} onClick={() => setMonthly(true)}>
          Todo mês
        </button>
        <button type="button" className="seg" aria-pressed={!monthly} onClick={() => setMonthly(false)}>
          Uma vez
        </button>
      </div>
      {monthly ? (
        <label className="stack small muted" style={{ gap: 6 }}>
          Dia do vencimento
          <input value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" style={inputStyle} />
        </label>
      ) : (
        <label className="stack small muted" style={{ gap: 6 }}>
          Data do vencimento
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required style={inputStyle} />
        </label>
      )}

      <div className="stack small muted" style={{ gap: 8 }}>
        Categoria
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Categoria">
          {expenseCats.map((c) => (
            <button key={c.id} type="button" className="chip row" style={{ gap: 6 }} aria-pressed={c.id === categoryId} onClick={() => setCategoryId(c.id === categoryId ? null : c.id)}>
              <CategoryIcon icon={c.icon} size={16} />
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {(formError || save.error) && <p className="small" style={{ color: 'var(--danger)' }}>{formError ?? save.error!.message}</p>}
      <div className="stack" style={{ gap: 4 }}>
        <button type="submit" className="btn" disabled={!name.trim() || save.isPending}>
          {save.isPending ? 'Salvando…' : bill ? 'Salvar' : 'Adicionar conta'}
        </button>
        {bill &&
          (confirmDelete ? (
            <button
              type="button"
              className="btn"
              style={{ background: 'var(--danger)', color: '#fff' }}
              onClick={() => action.mutate({ type: 'delete', id: bill.id }, { onSuccess: () => { toast('Conta excluída'); onDone(); } })}
            >
              Excluir de vez
            </button>
          ) : (
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              Excluir conta
            </button>
          ))}
      </div>
    </form>
  );
}
