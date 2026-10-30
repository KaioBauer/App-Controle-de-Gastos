import { addDays, localDate, toCents } from '@financas/shared';
import type { FastifyBaseLogger } from 'fastify';
import { accountAmount, mapCategory, pluggyLocalDate, reconcile, signedCents } from '../../domain/pluggy-mapping';
import { prisma } from '../../lib/db';
import type { PluggyAccount, PluggyClient, PluggyTransaction } from './client';

/** Na primeira sincronização trazemos 12 meses (o máximo usual do Open Finance). */
const BACKFILL_DAYS = 365;
/** Nas seguintes, reprocessamos uma janela recente: pendentes mudam e somem. */
const OVERLAP_DAYS = 10;

export interface SyncResult {
  itemId: string;
  accounts: number;
  created: number;
  updated: number;
  removed: number;
  /** Ids das transações novas (para notificações) */
  newTransactionIds: string[];
}

// Um sync por item por vez (instância única da API)
const running = new Map<string, Promise<SyncResult>>();

export function syncItem(client: PluggyClient, itemId: string, log: FastifyBaseLogger): Promise<SyncResult> {
  const current = running.get(itemId);
  if (current) return current;
  const p = doSync(client, itemId, log).finally(() => running.delete(itemId));
  running.set(itemId, p);
  return p;
}

export async function syncAll(client: PluggyClient, log: FastifyBaseLogger) {
  const items = await prisma.pluggyItem.findMany({ select: { id: true } });
  const results: SyncResult[] = [];
  for (const { id } of items) {
    try {
      results.push(await syncItem(client, id, log));
    } catch (err) {
      log.error({ err, itemId: id }, 'Falha ao sincronizar item da Pluggy');
    }
  }
  return results;
}

async function doSync(client: PluggyClient, itemId: string, log: FastifyBaseLogger): Promise<SyncResult> {
  const local = await prisma.pluggyItem.findUnique({ where: { id: itemId } });
  if (!local) throw new Error(`Item ${itemId} não cadastrado`);
  const firstSync = !local.lastSyncAt;
  const result: SyncResult = { itemId, accounts: 0, created: 0, updated: 0, removed: 0, newTransactionIds: [] };

  try {
    const item = await client.getItem(itemId);
    await prisma.pluggyItem.update({
      where: { id: itemId },
      data: {
        connectorName: item.connector.name,
        connectorImage: item.connector.imageUrl ?? null,
        status: item.status,
        executionStatus: item.executionStatus,
        errorMessage: item.error ? (item.error.providerMessage ?? item.error.message) : null,
        consentExpiresAt: item.consentExpiresAt ? new Date(item.consentExpiresAt) : null,
        lastUpdatedAt: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null,
      },
    });

    const today = localDate(new Date());
    const dateFrom = firstSync
      ? addDays(today, -BACKFILL_DAYS)
      : addDays(localDate(local.lastSyncAt!), -OVERLAP_DAYS);

    const categories = new Map((await prisma.category.findMany()).map((c) => [c.name, c.id]));
    const accounts = await client.listAccounts(itemId);
    result.accounts = accounts.length;

    for (const acc of accounts) {
      const accountId = await upsertAccount(itemId, acc);
      const txs = await client.listTransactions(acc.id, dateFrom);
      const r = await applyTransactions(accountId, txs, dateFrom, categories, firstSync);
      result.created += r.created.length;
      result.updated += r.updated;
      result.removed += r.removed;
      result.newTransactionIds.push(...r.created);

      if (acc.type === 'CREDIT') await syncBills(client, accountId, acc.id);
    }

    await syncInvestments(client, itemId).catch((err) =>
      // Nem todo conector tem investimentos; não derruba o sync
      log.warn({ err, itemId }, 'Investimentos indisponíveis'),
    );

    await prisma.pluggyItem.update({ where: { id: itemId }, data: { lastSyncAt: new Date(), lastSyncError: null } });
    log.info({ ...result, newTransactionIds: result.newTransactionIds.length }, 'Sync da Pluggy concluído');
    return result;
  } catch (err) {
    await prisma.pluggyItem.update({
      where: { id: itemId },
      data: { lastSyncError: String((err as Error).message ?? err).slice(0, 500) },
    });
    throw err;
  }
}

/** Nome curto para a interface: "platinum" -> "Cartão Platinum"; corta sufixos longos do banco. */
export function accountDisplayName(acc: Pick<PluggyAccount, 'type' | 'name' | 'marketingName'>): string {
  const raw = (acc.marketingName || acc.name).trim();
  if (acc.type === 'CREDIT') {
    const pretty = raw.charAt(0).toUpperCase() + raw.slice(1);
    return /cart[aã]o|card/i.test(pretty) ? pretty : `Cartão ${pretty}`;
  }
  // "Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)" -> "Nu Pagamentos S.A."
  return raw.split(' - ')[0]!.trim();
}

async function upsertAccount(itemId: string, acc: PluggyAccount): Promise<string> {
  const credit = acc.creditData;
  const data = {
    name: accountDisplayName(acc),
    type: acc.type === 'CREDIT' ? ('CREDIT' as const) : ('BANK' as const),
    subtype: acc.subtype,
    number: acc.number,
    itemId,
    balanceCents: BigInt(toCents(acc.balance)),
    creditLimitCents: credit?.creditLimit != null ? BigInt(toCents(credit.creditLimit)) : null,
    availableCreditCents: credit?.availableCreditLimit != null ? BigInt(toCents(credit.availableCreditLimit)) : null,
    closeDate: credit?.balanceCloseDate ? new Date(credit.balanceCloseDate) : null,
    dueDate: credit?.balanceDueDate ? new Date(credit.balanceDueDate) : null,
  };
  const row = await prisma.account.upsert({
    where: { pluggyAccountId: acc.id },
    create: { ...data, pluggyAccountId: acc.id },
    update: data,
  });
  return row.id;
}

async function applyTransactions(
  accountId: string,
  txs: PluggyTransaction[],
  dateFrom: string,
  categories: Map<string, string>,
  firstSync: boolean,
) {
  const existing = await prisma.transaction.findMany({
    where: { accountId, pluggyId: { not: null }, deletedAt: null, localDate: { gte: dateFrom } },
    select: { id: true, pluggyId: true, amountCents: true, localDate: true, description: true, status: true },
  });

  const incoming = txs.map((t) => ({
    raw: t,
    pluggyId: t.id,
    amountCents: signedCents(accountAmount(t), t.type),
    localDate: pluggyLocalDate(t.date),
    description: t.description || t.descriptionRaw || 'Transação',
  }));
  const byId = new Map(incoming.map((t) => [t.pluggyId, t]));

  const plan = reconcile(
    existing.map((e) => ({ ...e, pluggyId: e.pluggyId!, amountCents: Number(e.amountCents) })),
    incoming,
  );

  // Campos que sempre vêm do banco (o usuário não edita)
  const bankFields = (t: (typeof incoming)[number]) => ({
    amountCents: BigInt(t.amountCents),
    date: new Date(t.raw.date),
    localDate: t.localDate,
    description: t.description,
    merchant: t.raw.merchant?.businessName ?? t.raw.merchant?.name ?? null,
    pluggyCategory: t.raw.category,
    status: t.raw.status ?? null,
    installmentNumber: t.raw.creditCardMetadata?.installmentNumber ?? null,
    totalInstallments: t.raw.creditCardMetadata?.totalInstallments ?? null,
    billId: t.raw.creditCardMetadata?.billId ?? null,
    purchaseDate: t.raw.creditCardMetadata?.purchaseDate ? pluggyLocalDate(t.raw.creditCardMetadata.purchaseDate) : null,
  });
  const autoCategory = (t: (typeof incoming)[number]) => {
    const m = mapCategory(t.raw.category, t.raw.type, t.description);
    return { categoryId: categories.get(m.name) ?? null, isTransfer: m.isTransfer };
  };

  const created: string[] = [];
  await prisma.$transaction(async (db) => {
    for (const pluggyId of plan.create) {
      const t = byId.get(pluggyId)!;
      // upsert: uma transação removida antes (ou fora da janela) pode reaparecer com o mesmo pluggyId
      const row = await db.transaction.upsert({
        where: { pluggyId },
        create: {
          accountId,
          pluggyId,
          ...bankFields(t),
          ...autoCategory(t),
          // O histórico inicial chega como revisado para não lotar o badge
          reviewed: firstSync,
        },
        update: { accountId, ...bankFields(t), deletedAt: null },
        select: { id: true, createdAt: true },
      });
      if (!firstSync && Date.now() - row.createdAt.getTime() < 60_000) created.push(row.id);
    }

    for (const pluggyId of plan.update) {
      const t = byId.get(pluggyId)!;
      const current = await db.transaction.findUniqueOrThrow({ where: { pluggyId }, select: { categoryLocked: true } });
      await db.transaction.update({
        where: { pluggyId },
        data: { ...bankFields(t), ...(current.categoryLocked ? {} : autoCategory(t)) },
      });
    }

    // Pendente que virou lançada: mantém id local (notas, tags, revisão) e adota o novo pluggyId
    for (const { existingId, pluggyId } of plan.replace) {
      const t = byId.get(pluggyId)!;
      const current = await db.transaction.findUniqueOrThrow({ where: { id: existingId }, select: { categoryLocked: true } });
      // Libera o pluggyId caso exista uma cópia antiga removida
      await db.transaction.deleteMany({ where: { pluggyId, deletedAt: { not: null } } });
      await db.transaction.update({
        where: { id: existingId },
        data: { pluggyId, ...bankFields(t), ...(current.categoryLocked ? {} : autoCategory(t)) },
      });
    }

    if (plan.remove.length) {
      await db.transaction.updateMany({ where: { id: { in: plan.remove } }, data: { deletedAt: new Date() } });
    }
  }, { timeout: 60_000 });

  return { created, updated: plan.update.length + plan.replace.length, removed: plan.remove.length };
}

async function syncBills(client: PluggyClient, accountId: string, pluggyAccountId: string) {
  const bills = await client.listBills(pluggyAccountId);
  for (const b of bills) {
    const data = {
      accountId,
      dueDate: new Date(b.dueDate),
      totalAmountCents: BigInt(toCents(b.totalAmount)),
      minimumPaymentCents: b.minimumPaymentAmount != null ? BigInt(toCents(b.minimumPaymentAmount)) : null,
    };
    await prisma.creditCardBill.upsert({ where: { id: b.id }, create: { id: b.id, ...data }, update: data });
  }
}

async function syncInvestments(client: PluggyClient, itemId: string) {
  const investments = await client.listInvestments(itemId);
  for (const inv of investments) {
    const data = { itemId, name: inv.name, type: inv.type, subtype: inv.subtype, balanceCents: BigInt(toCents(inv.balance)) };
    await prisma.investment.upsert({ where: { id: inv.id }, create: { id: inv.id, ...data }, update: data });
  }
}
