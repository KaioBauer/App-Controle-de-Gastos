import { describe, expect, it } from 'vitest';
import { goalProgress } from './goals';

const goal = { targetCents: 1_200_000, deadline: '2027-10-30', createdOn: '2026-04-30' };

describe('goalProgress', () => {
  it('quanto falta por mês até o prazo e se o ritmo atual chega lá', () => {
    // 6 meses desde a criação, 6.000 guardados = 1.000/mês; faltam 6.000 em 12 meses = 500/mês
    const p = goalProgress(goal, [{ amountCents: 400_000 }, { amountCents: 200_000 }], '2026-10-30');
    expect(p.savedCents).toBe(600_000);
    expect(p.pct).toBe(50);
    expect(p.monthsLeft).toBe(12);
    expect(p.perMonthCents).toBe(50_000);
    expect(p.status).toBe('on-track');
  });

  it('ritmo abaixo do necessário fica atrasado', () => {
    const p = goalProgress(goal, [{ amountCents: 60_000 }], '2026-10-30');
    expect(p.status).toBe('behind');
    expect(p.perMonthCents).toBe(95_000);
  });

  it('retiradas descontam; meta batida, sem prazo e prazo vencido', () => {
    expect(goalProgress(goal, [{ amountCents: 1_300_000 }], '2026-10-30').status).toBe('done');
    expect(goalProgress({ ...goal, deadline: null }, [{ amountCents: 100_000 }], '2026-10-30').status).toBe('no-deadline');
    const late = goalProgress({ ...goal, deadline: '2026-10-01' }, [{ amountCents: 500_000 }, { amountCents: -100_000 }], '2026-10-30');
    expect(late.savedCents).toBe(400_000);
    expect(late.status).toBe('late');
  });

  it('último mês ainda conta como 1 mês para guardar', () => {
    expect(goalProgress({ ...goal, deadline: '2026-11-05' }, [], '2026-10-30').monthsLeft).toBe(1);
  });
});
