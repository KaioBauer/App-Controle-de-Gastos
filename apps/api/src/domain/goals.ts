import { diffDays } from '@financas/shared';

export interface GoalProgress {
  savedCents: number;
  pct: number;
  remainingCents: number;
  /** Meses inteiros até o prazo (mínimo 1 enquanto o prazo não passou) */
  monthsLeft: number | null;
  /** Quanto guardar por mês para chegar no prazo */
  perMonthCents: number | null;
  /** Ritmo médio de aportes desde a criação, por mês */
  paceCents: number;
  status: 'done' | 'on-track' | 'behind' | 'no-deadline' | 'late';
}

const DAYS_PER_MONTH = 30.44;

/**
 * Progresso de uma meta: guardado, quanto falta por mês até o prazo e se o ritmo atual
 * (média de aportes desde a criação) chega lá.
 */
export function goalProgress(
  goal: { targetCents: number; deadline: string | null; createdOn: string },
  contributions: { amountCents: number }[],
  today: string,
): GoalProgress {
  const savedCents = Math.max(0, contributions.reduce((s, c) => s + c.amountCents, 0));
  const remainingCents = Math.max(0, goal.targetCents - savedCents);
  const pct = goal.targetCents > 0 ? Math.min(100, (savedCents / goal.targetCents) * 100) : 0;
  const elapsedMonths = Math.max(1, diffDays(today, goal.createdOn) / DAYS_PER_MONTH);
  const paceCents = Math.round(savedCents / elapsedMonths);

  if (remainingCents === 0) return { savedCents, pct, remainingCents, monthsLeft: null, perMonthCents: null, paceCents, status: 'done' };
  if (!goal.deadline) return { savedCents, pct, remainingCents, monthsLeft: null, perMonthCents: null, paceCents, status: 'no-deadline' };

  const daysLeft = diffDays(goal.deadline, today);
  if (daysLeft < 0) return { savedCents, pct, remainingCents, monthsLeft: 0, perMonthCents: remainingCents, paceCents, status: 'late' };

  const monthsLeft = Math.max(1, Math.round(daysLeft / DAYS_PER_MONTH));
  const perMonthCents = Math.ceil(remainingCents / monthsLeft);
  return {
    savedCents,
    pct,
    remainingCents,
    monthsLeft,
    perMonthCents,
    paceCents,
    status: paceCents >= perMonthCents ? 'on-track' : 'behind',
  };
}
