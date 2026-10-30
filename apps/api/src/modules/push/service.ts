import type { PushPayload } from '@financas/shared';
import webpush from 'web-push';
import type { Env } from '../../env';

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SubscriptionStore {
  list(): Promise<StoredSubscription[]>;
  remove(id: string): Promise<void>;
  markSuccess(id: string): Promise<void>;
  markError(id: string, message: string): Promise<void>;
}

export type Sender = (sub: StoredSubscription, body: string) => Promise<void>;

export interface SendResult {
  sent: number;
  removed: number;
  failed: number;
}

/** Status que indicam que a inscrição não existe mais (app removido, permissão revogada). */
const GONE_STATUS = new Set([404, 410]);

export async function sendToAll(payload: PushPayload, store: SubscriptionStore, send: Sender): Promise<SendResult> {
  const subs = await store.list();
  const body = JSON.stringify(payload);
  const result: SendResult = { sent: 0, removed: 0, failed: 0 };

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await send(sub, body);
        await store.markSuccess(sub.id);
        result.sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status && GONE_STATUS.has(status)) {
          await store.remove(sub.id);
          result.removed++;
        } else {
          await store.markError(sub.id, String((err as { body?: string }).body ?? err).slice(0, 500));
          result.failed++;
        }
      }
    }),
  );
  return result;
}

export function createWebPushSender(env: Env): Sender {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return async (sub, body) => {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
      TTL: 24 * 60 * 60,
      urgency: 'high',
    });
  };
}
