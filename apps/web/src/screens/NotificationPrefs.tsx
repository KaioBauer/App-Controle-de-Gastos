import type { NotificationSettingsDTO } from '@financas/shared';
import { formatAmount, toCents } from '@financas/shared';
import { useEffect, useState } from 'react';
import { useNotificationSettings, useSaveNotificationSettings } from '../lib/queries';
import { Switch } from '../ui/common';

type ToggleKey = 'newTransaction' | 'budget' | 'billsDue' | 'lowBalance' | 'unusualSpending' | 'weeklySummary' | 'monthlySummary' | 'syncErrors';

const TYPES: { key: ToggleKey; title: string; sub: string }[] = [
  { key: 'newTransaction', title: 'Nova transação', sub: 'Valor, estabelecimento e categoria' },
  { key: 'budget', title: 'Orçamentos', sub: 'Ao chegar em 80% e em 100%' },
  { key: 'billsDue', title: 'Faturas a vencer', sub: '3 dias antes e no dia' },
  { key: 'lowBalance', title: 'Saldo baixo', sub: 'Quando a conta fica abaixo do limite' },
  { key: 'unusualSpending', title: 'Gasto incomum', sub: 'Muito acima do normal da categoria' },
  { key: 'weeklySummary', title: 'Resumo semanal', sub: 'Domingo às 20h' },
  { key: 'monthlySummary', title: 'Fechamento do mês', sub: 'Dia 1º às 9h' },
  { key: 'syncErrors', title: 'Conexões', sub: 'Erro de sincronização e consentimento expirando' },
];

const fieldStyle = {
  width: 120,
  height: 40,
  border: 0,
  borderRadius: 12,
  background: 'var(--fill)',
  padding: '0 12px',
  fontSize: 16,
  textAlign: 'right' as const,
  outline: 'none',
};

/** Valor em reais editável: mostra "1.234,56" e salva em centavos ao sair do campo. */
function MoneyField({ cents, label, onSave }: { cents: number; label: string; onSave: (c: number) => void }) {
  const [text, setText] = useState(formatAmount(cents));
  useEffect(() => setText(formatAmount(cents)), [cents]);
  const commit = () => {
    try {
      const v = Math.max(0, toCents(text || '0'));
      setText(formatAmount(v));
      if (v !== cents) onSave(v);
    } catch {
      setText(formatAmount(cents));
    }
  };
  return (
    <label className="row small muted" style={{ gap: 8 }}>
      {label}
      <span className="row" style={{ gap: 6 }}>
        R$
        <input
          className="num"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          style={fieldStyle}
          aria-label={label}
        />
      </span>
    </label>
  );
}

/** Tipos de notificação, valores mínimos e horário de silêncio (salvos na hora). */
export function NotificationPrefs() {
  const { data } = useNotificationSettings();
  const save = useSaveNotificationSettings();
  if (!data) return null;

  const update = (patch: Partial<NotificationSettingsDTO>) => save.mutate({ ...data, ...patch });
  const quietOn = !!(data.quietStart && data.quietEnd);

  return (
    <>
      <section className="stack" style={{ gap: 10 }}>
        <h2 className="small muted" style={{ fontWeight: 500, paddingLeft: 4 }}>
          O que avisar
        </h2>
        <div className="list fu">
          {TYPES.map((t) => (
            <div key={t.key}>
              <button type="button" className="item" role="switch" aria-checked={data[t.key]} onClick={() => update({ [t.key]: !data[t.key] })}>
                <span className="item-main">
                  <span className="item-title">{t.title}</span>
                  <span className="item-sub">{t.sub}</span>
                </span>
                <Switch checked={data[t.key]} />
              </button>
              {t.key === 'newTransaction' && data.newTransaction && (
                <div className="between" style={{ padding: '0 12px 12px' }}>
                  <MoneyField label="Só a partir de" cents={data.newTransactionMinCents} onSave={(c) => update({ newTransactionMinCents: c })} />
                </div>
              )}
              {t.key === 'lowBalance' && data.lowBalance && (
                <div className="between" style={{ padding: '0 12px 12px' }}>
                  <MoneyField label="Avisar abaixo de" cents={data.lowBalanceCents} onSave={(c) => update({ lowBalanceCents: c })} />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="stack" style={{ gap: 10 }}>
        <div className="list fu">
          <button
            type="button"
            className="item"
            role="switch"
            aria-checked={quietOn}
            onClick={() => update(quietOn ? { quietStart: null, quietEnd: null } : { quietStart: '22:00', quietEnd: '07:00' })}
          >
            <span className="item-main">
              <span className="item-title">Horário de silêncio</span>
              <span className="item-sub">Os avisos esperam e chegam quando o silêncio acaba</span>
            </span>
            <Switch checked={quietOn} />
          </button>
          {quietOn && (
            <div className="row small muted" style={{ gap: 10, padding: '0 12px 12px', flexWrap: 'wrap' }}>
              <label className="row" style={{ gap: 6 }}>
                Das
                <input type="time" value={data.quietStart!} onChange={(e) => e.target.value && update({ quietStart: e.target.value })} style={{ ...fieldStyle, width: 110, textAlign: 'center' }} />
              </label>
              <label className="row" style={{ gap: 6 }}>
                às
                <input type="time" value={data.quietEnd!} onChange={(e) => e.target.value && update({ quietEnd: e.target.value })} style={{ ...fieldStyle, width: 110, textAlign: 'center' }} />
              </label>
            </div>
          )}
        </div>
        {save.error && (
          <p className="small" style={{ color: 'var(--danger)', padding: '0 8px' }}>
            Não foi possível salvar: {save.error.message}
          </p>
        )}
      </section>
    </>
  );
}
