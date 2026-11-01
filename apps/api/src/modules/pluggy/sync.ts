import { addDays, localDate, toCents } from '@financas/shared';
import type { FastifyBaseLogger } from 'fastify';
import { merchantKey, ruleCategory } from '../../domain/merchant';
import {
  accountAmount,
  mapCategory,
  pluggyLocalDate,
  reconcile,
  SAME_PERSON_CATEGORY,
  signedCents,
  unmatchedOwnTransfers,
} from '../../domain/pluggy-mapping';
import { asSystem, currentUserId, prisma, runAsUser } from '../../lib/db';
import type { PluggyAccount, PluggyClient, PluggyTransaction } from './client';
import type { PluggyClients } from './clients';

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

/**
 * Sincroniza um item no contexto do dono dele (webhook e job não têm usuário), com as
 * credenciais da Pluggy desse dono.
 */
export function syncItem(clients: PluggyClients, itemId: string, log: FastifyBaseLogger): Promise<SyncResult> {
  const current = running.get(itemId);
  if (current) return current;
  const p = asSystem(() => prisma.pluggyItem.findUnique({ where: { id: itemId }, select: { userId: true } }))
    .then((owner) => {
      if (!owner) throw new Error(`Item ${itemId} não cadastrado`);
      return runAsUser(owner.userId, async () => {
        const client = await clients.forCurrentUser();
        if (!client) throw new Error('Pluggy não configurada: cadastre o Client ID e o Client Secret em Ajustes › Conexões');
        return doSync(client, itemId, log);
      });
    })
    .finally(() => running.delete(itemId));
  running.set(itemId, p);
  return p;
}

export async function syncAll(clients: PluggyClients, log: FastifyBaseLogger) {
  // Itens de todos os usuários; cada sync roda no contexto do dono
  const items = await asSystem(() => prisma.pluggyItem.findMany({ select: { id: true } }));
  const results: SyncResult[] = [];
  for (const { id } of items) {
    try {
      results.push(await syncItem(clients, id, log));
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

    const catalog = await loadCatalog();
    const accounts = await client.listAccounts(itemId);
    result.accounts = accounts.length;

    for (const acc of accounts) {
      const accountId = await upsertAccount(itemId, acc);
      const txs = await client.listTransactions(acc.id, dateFrom);
      const r = await applyTransactions(accountId, txs, dateFrom, catalog, firstSync);
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

    await settleOwnTransfers();
    await prisma.pluggyItem.update({ where: { id: itemId }, data: { lastSyncAt: new Date(), lastSyncError: null } });
    log.info({ ...result, newTransactionIds: result.newTransactionIds.length }, 'Sync da Pluggy concluído');
    await runHooks(result, log);
    return result;
  } catch (err) {
    await prisma.pluggyItem.update({
      where: { id: itemId },
      data: { lastSyncError: String((err as Error).message ?? err).slice(0, 500) },
    });
    await runHooks({ ...result, failed: true }, log);
    throw err;
  }
}

export type SyncHook = (result: SyncResult & { failed?: boolean }) => Promise<void>;
const hooks: SyncHook[] = [];

/** Registra quem reage ao fim de cada sync (ex.: notificações), sem acoplar este módulo a eles. */
export function onSyncFinished(hook: SyncHook) {
  hooks.push(hook);
}

async function runHooks(result: SyncResult & { failed?: boolean }, log: FastifyBaseLogger) {
  for (const hook of hooks) {
    // Um aviso que falha não pode derrubar o sync
    await hook(result).catch((err) => log.error({ err }, 'Falha ao processar o fim do sync'));
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
    create: { ...data, userId: currentUserId(), pluggyAccountId: acc.id },
    update: data,
  });
  return row.id;
}

/** Categorias (por nome e tipo) e regras do usuário, carregadas uma vez por sync. */
export interface Catalog {
  idByName: Map<string, string>;
  kindById: Map<string, string>;
  rules: Map<string, string>;
}

export async function loadCatalog(): Promise<Catalog> {
  const [cats, rules] = await Promise.all([prisma.category.findMany(), prisma.categoryRule.findMany()]);
  return {
    idByName: new Map(cats.map((c) => [c.name, c.id])),
    kindById: new Map(cats.map((c) => [c.id, c.kind])),
    rules: new Map(rules.map((r) => [r.pattern, r.categoryId])),
  };
}

/** Regra do usuário primeiro; senão, o mapeamento automático da categoria da Pluggy. */
export function categorize(catalog: Catalog, pluggyCategory: string | null, type: 'DEBIT' | 'CREDIT', description: string) {
  const ruled = ruleCategory(description, catalog.rules);
  if (ruled) return { categoryId: ruled, isTransfer: catalog.kindById.get(ruled) === 'TRANSFER' };
  const m = mapCategory(pluggyCategory, type, description);
  return { categoryId: catalog.idByName.get(m.name) ?? null, isTransfer: m.isTransfer };
}

async function applyTransactions(
  accountId: string,
  txs: PluggyTransaction[],
  dateFrom: string,
  catalog: Catalog,
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
    merchantKey: merchantKey(t.description) || null,
    pluggyCategory: t.raw.category,
    status: t.raw.status ?? null,
    installmentNumber: t.raw.creditCardMetadata?.installmentNumber ?? null,
    totalInstallments: t.raw.creditCardMetadata?.totalInstallments ?? null,
    billId: t.raw.creditCardMetadata?.billId ?? null,
    purchaseDate: t.raw.creditCardMetadata?.purchaseDate ? pluggyLocalDate(t.raw.creditCardMetadata.purchaseDate) : null,
  });
  const autoCategory = (t: (typeof incoming)[number]) => categorize(catalog, t.raw.category, t.raw.type, t.description);

  const created: string[] = [];
  await prisma.$transaction(async (db) => {
    for (const pluggyId of plan.create) {
      const t = byId.get(pluggyId)!;
      // upsert: uma transação removida antes (ou fora da janela) pode reaparecer com o mesmo pluggyId
      const row = await db.transaction.upsert({
        where: { pluggyId },
        create: {
          userId: currentUserId(),
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
    await prisma.creditCardBill.upsert({ where: { id: b.id }, create: { id: b.id, userId: currentUserId(), ...data }, update: data });
  }
}

async function syncInvestments(client: PluggyClient, itemId: string) {
  const investments = await client.listInvestments(itemId);
  for (const inv of investments) {
    const data = { itemId, name: inv.name, type: inv.type, subtype: inv.subtype, balanceCents: BigInt(toCents(inv.balance)) };
    await prisma.investment.upsert({ where: { id: inv.id }, create: { id: inv.id, userId: currentUserId(), ...data }, update: data });
  }
}

/**
 * Entradas "da mesma pessoa" sem a saída correspondente numa conta do app vieram de uma conta
 * própria que não está conectada (ex.: salário repassado de outro banco): contam como entrada.
 * Com contrapartida, continuam transferência. Respeita categoria travada e regras do usuário.
 */
export async function settleOwnTransfers() {
  const [rows, catalog] = await Promise.all([
    prisma.transaction.findMany({
      where: { deletedAt: null, amountCents: { not: 0 } },
      select: {
        id: true,
        accountId: true,
        amountCents: true,
        localDate: true,
        pluggyCategory: true,
        description: true,
        categoryId: true,
        categoryLocked: true,
        isTransfer: true,
      },
    }),
    loadCatalog(),
  ]);
  const unmatched = new Set(unmatchedOwnTransfers(rows.map((r) => ({ ...r, amountCents: Number(r.amountCents) }))));
  const incomeId = catalog.idByName.get('Outras entradas');
  const transferId = catalog.idByName.get('Transferências');
  if (!incomeId || !transferId) return 0;

  let changed = 0;
  for (const r of rows) {
    if (r.amountCents <= 0n || r.categoryLocked || !SAME_PERSON_CATEGORY.test(r.pluggyCategory ?? '')) continue;
    if (ruleCategory(r.description, catalog.rules)) continue;
    const target = unmatched.has(r.id) ? { categoryId: incomeId, isTransfer: false } : { categoryId: transferId, isTransfer: true };
    if (r.categoryId === target.categoryId && r.isTransfer === target.isTransfer) continue;
    await prisma.transaction.update({ where: { id: r.id }, data: target });
    changed++;
  }
  return changed;
}
