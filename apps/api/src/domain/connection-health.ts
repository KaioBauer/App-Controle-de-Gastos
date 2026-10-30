import type { ConnectionHealth } from '@financas/shared';

/** Avisamos para renovar o consentimento com esta antecedência. */
export const CONSENT_WARNING_DAYS = 7;

const NEEDS_ACTION = new Set(['LOGIN_ERROR', 'OUTDATED', 'WAITING_USER_INPUT', 'WAITING_USER_ACTION']);

export function connectionHealth(
  item: { status: string; consentExpiresAt: Date | null; lastSyncError: string | null; lastSyncAt: Date | null },
  now: Date,
): ConnectionHealth {
  if (item.consentExpiresAt && item.consentExpiresAt <= now) return 'expired';
  if (NEEDS_ACTION.has(item.status) || item.lastSyncError) return 'error';
  if (item.consentExpiresAt && item.consentExpiresAt.getTime() - now.getTime() <= CONSENT_WARNING_DAYS * 86_400_000) {
    return 'expiring';
  }
  if (item.status === 'UPDATING' || !item.lastSyncAt) return 'syncing';
  return 'ok';
}
