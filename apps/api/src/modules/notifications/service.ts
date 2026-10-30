import { addDays, addMonths, daysInMonth, isInQuietHours, localDate } from '@financas/shared';
import type { NotificationSettings } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { periodRange } from '../../domain/analysis';
import {
  budgetNotices,
  connectionNotices,
  dueNotices,
  enabledOnly,
  lowBalanceNotices,
  monthlySummaryNotice,
  newTransactionNotices,
  unusualNotices,
  weeklySummaryNotice,
  type Notice,
  type NotificationToggles,
} from '../../domain/notifications';
import { incomeOf, spendingByCategory, spendingOf, sumSpending } from '../../domain/spending';
import { prisma } from '../../lib/db';
import { buildCards } from '../finance/cards';
import { flowTxs, unreviewedCount } from '../finance/queries';
import { loadBudgets } from '../finance/routes';
import { sendToAll, type Sender } from '../push/service';
import { prismaSubscriptionStore } from '../push/store';

/** Avisos que ficaram na fila por mais que isso (ex.: app sem aparelhos) são descartados. */
const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000;
/** Histórico usado para saber o que é um gasto "normal" na categoria */
const UNUSUAL_HISTORY_DAYS = 120;

export function getSettings(): Promise<NotificationSettings> {
  return prisma.notificationSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

function toggles(s: NotificationSettings): NotificationToggles {
  return {
    newTransaction: s.newTransaction,
    budget: s.budget,
    billsDue: s.billsDue,
    lowBalance: s.lowBalance,
    unusualSpending: s.unusualSpending,
    weeklySummary: s.weeklySummary,
    monthlySummary: s.monthlySummary,
    syncErrors: s.syncErrors,
  };
}

export class Notifier {
  constructor(
    private send: Sender,
    private log: FastifyBaseLogger,
  ) {}

  /** Coloca os avisos na fila (sem repetir dedupeKey) e tenta enviar. */
  async notify(notices: Notice[]) {
    const settings = await getSettings();
    const enabled = enabledOnly(notices, toggles(settings));
    if (enabled.length) {
      await prisma.notificationOutbox.createMany({
        data: enabled.map((n) => ({ dedupeKey: n.dedupeKey, type: n.type, title: n.title, body: n.body, url: n.url })),
        skipDuplicates: true,
      });
    }
    await this.dispatch(new Date(), settings);
  }

  /** Envia o que está na fila, exceto no horário de silêncio (fica para depois). */
  async dispatch(now = new Date(), settings?: NotificationSettings) {
    const s = settings ?? (await getSettings());
    if (isInQuietHours(now, s.quietStart, s.quietEnd)) return { sent: 0, quiet: true };

    const pending = await prisma.notificationOutbox.findMany({ where: { sentAt: null }, orderBy: { createdAt: 'asc' }, take: 20 });
    if (pending.length === 0) return { sent: 0, quiet: false };

    const badge = await unreviewedCount();
    let sent = 0;
    for (const n of pending) {
      if (now.getTime() - n.createdAt.getTime() > MAX_QUEUE_AGE_MS) {
        await prisma.notificationOutbox.update({ where: { id: n.id }, data: { sentAt: now } });
        continue;
      }
      const r = await sendToAll({ title: n.title, body: n.body, url: n.url, tag: n.dedupeKey, badge }, prismaSubscriptionStore, this.send);
      // Sem aparelhos inscritos não há o que reenviar depois: sai da fila do mesmo jeito
      await prisma.notificationOutbox.update({ where: { id: n.id }, data: { sentAt: now } });
      sent += r.sent;
    }
    this.log.info({ sent, items: pending.length }, 'Notificações enviadas');
    return { sent, quiet: false };
  }

  /** Depois de cada sync: transações novas, gasto incomum, orçamentos, saldo baixo e conexão. */
  async afterSync(result: { itemId: string; newTransactionIds: string[]; failed?: boolean }) {
    const today = localDate(new Date());
    const settings = await getSettings();
    const notices: Notice[] = [];

    if (result.newTransactionIds.length) {
      const rows = await prisma.transaction.findMany({
        where: { id: { in: result.newTransactionIds }, deletedAt: null },
        include: { category: true },
      });
      const infos = rows.map((r) => ({
        id: r.id,
        description: r.description,
        amountCents: Number(r.amountCents),
        isTransfer: r.isTransfer || r.category?.kind === 'TRANSFER',
        categoryId: r.categoryId,
        categoryName: r.category?.name ?? null,
      }));
      notices.push(...newTransactionNotices(infos, Number(settings.newTransactionMin)));
      notices.push(...unusualNotices(infos, await this.categoryHistory(today, new Set(result.newTransactionIds))));
    }

    if (!result.failed) {
      const budgets = await loadBudgets(today);
      notices.push(...budgetNotices(budgets.budgets, budgets.month));
      const accounts = await prisma.account.findMany({ where: { type: 'BANK', itemId: result.itemId } });
      notices.push(
        ...lowBalanceNotices(
          accounts.map((a) => ({ id: a.id, name: a.name, balanceCents: Number(a.balanceCents) })),
          Number(settings.lowBalanceCents),
          today,
        ),
      );
    }

    notices.push(...(await this.connectionNotices(today, result.itemId)));
    await this.notify(notices);
  }

  /** Todo dia de manhã: faturas/contas vencendo e consentimentos expirando. */
  async daily() {
    const today = localDate(new Date());
    const { cards } = await buildCards(today);
    const dues = cards
      .filter((c) => c.openBill.dueDate)
      .map((c) => ({
        key: c.accountId,
        name: `Fatura do ${c.name}`,
        amountCents: c.openBill.totalCents > 0 ? c.openBill.totalCents : null,
        dueDate: c.openBill.dueDate!,
        url: '/cartoes',
      }));
    await this.notify([...dueNotices(dues, today), ...(await this.connectionNotices(today))]);
  }

  /** Domingo à noite: gastos da semana (segunda a domingo) comparados com a anterior. */
  async weekly() {
    const today = localDate(new Date());
    const r = periodRange('week', today);
    const [txs, cats] = await Promise.all([flowTxs(r.prevStart, r.end), prisma.category.findMany()]);
    const current = txs.filter((t) => t.localDate >= r.start && t.localDate <= today);
    const previous = txs.filter((t) => t.localDate >= r.prevStart && t.localDate < r.start);
    const byCat = [...spendingByCategory(current).entries()].sort((a, b) => b[1] - a[1]);
    const top = byCat[0] && byCat[0][1] > 0 ? { name: cats.find((c) => c.id === byCat[0]![0])?.name ?? 'Sem categoria', cents: byCat[0][1] } : null;
    await this.notify([weeklySummaryNotice(r.start, sumSpending(current), sumSpending(previous), top)]);
  }

  /** Dia 1º: fechamento do mês anterior. */
  async monthly() {
    const today = localDate(new Date());
    const month = addMonths(today.slice(0, 7), -1);
    const last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
    const txs = await flowTxs(`${month}-01`, last);
    const budgets = await prisma.budget.findMany();
    const spent = spendingByCategory(txs);
    const over = budgets.filter((b) => (spent.get(b.categoryId) ?? 0) > Number(b.limitCents)).length;
    await this.notify([monthlySummaryNotice(month, sumSpending(txs), txs.reduce((s, t) => s + incomeOf(t), 0), over)]);
  }

  /** Valores gastos por categoria no histórico recente (sem as transações que estão sendo avaliadas). */
  private async categoryHistory(today: string, exclude: Set<string>) {
    const rows = await prisma.transaction.findMany({
      where: { deletedAt: null, localDate: { gte: addDays(today, -UNUSUAL_HISTORY_DAYS), lte: today }, id: { notIn: [...exclude] } },
      select: { amountCents: true, localDate: true, categoryId: true, isTransfer: true, category: { select: { kind: true } } },
    });
    const out = new Map<string, number[]>();
    for (const r of rows) {
      const v = spendingOf({ amountCents: Number(r.amountCents), localDate: r.localDate, categoryId: r.categoryId, categoryKind: r.category?.kind ?? null, isTransfer: r.isTransfer });
      if (v <= 0 || !r.categoryId) continue;
      const list = out.get(r.categoryId) ?? [];
      list.push(v);
      out.set(r.categoryId, list);
    }
    return out;
  }

  private async connectionNotices(today: string, itemId?: string) {
    const items = await prisma.pluggyItem.findMany({ where: itemId ? { id: itemId } : {} });
    const needsAction = new Set(['LOGIN_ERROR', 'OUTDATED', 'WAITING_USER_INPUT', 'WAITING_USER_ACTION']);
    return connectionNotices(
      items.map((i) => ({
        itemId: i.id,
        name: i.connectorName || 'banco',
        error: needsAction.has(i.status) || i.lastSyncError ? (i.errorMessage ?? i.lastSyncError ?? 'A conexão precisa de atenção.') : null,
        consentExpiresAt: i.consentExpiresAt ? localDate(i.consentExpiresAt) : null,
      })),
      today,
    );
  }
}
