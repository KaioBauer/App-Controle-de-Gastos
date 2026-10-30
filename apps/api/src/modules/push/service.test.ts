import { describe, expect, it, vi } from 'vitest';
import { sendToAll, type StoredSubscription, type SubscriptionStore } from './service';

const subs: StoredSubscription[] = [
  { id: 'ok', endpoint: 'https://web.push.apple.com/a', p256dh: 'x', auth: 'y' },
  { id: 'gone', endpoint: 'https://web.push.apple.com/b', p256dh: 'x', auth: 'y' },
  { id: 'flaky', endpoint: 'https://web.push.apple.com/c', p256dh: 'x', auth: 'y' },
];

function memoryStore(): SubscriptionStore & { removed: string[]; errors: string[] } {
  const removed: string[] = [];
  const errors: string[] = [];
  return {
    removed,
    errors,
    list: async () => subs,
    remove: async (id) => void removed.push(id),
    markSuccess: async () => {},
    markError: async (id) => void errors.push(id),
  };
}

describe('sendToAll', () => {
  it('remove inscrições expiradas (410) e mantém as que falharam temporariamente', async () => {
    const store = memoryStore();
    const send = vi.fn(async (sub: StoredSubscription, _body: string) => {
      if (sub.id === 'gone') throw Object.assign(new Error('gone'), { statusCode: 410 });
      if (sub.id === 'flaky') throw Object.assign(new Error('boom'), { statusCode: 503 });
    });

    const result = await sendToAll({ title: 't', body: 'b', url: '/' }, store, send);

    expect(result).toEqual({ sent: 1, removed: 1, failed: 1 });
    expect(store.removed).toEqual(['gone']);
    expect(store.errors).toEqual(['flaky']);
    expect(JSON.parse(send.mock.calls[0]![1])).toMatchObject({ title: 't', url: '/' });
  });
});
