import { prisma } from '../../lib/db';
import type { SubscriptionStore } from './service';

export const prismaSubscriptionStore: SubscriptionStore = {
  list: () => prisma.pushSubscription.findMany({ select: { id: true, endpoint: true, p256dh: true, auth: true } }),
  remove: async (id) => {
    await prisma.pushSubscription.deleteMany({ where: { id } });
  },
  markSuccess: async (id) => {
    await prisma.pushSubscription.update({ where: { id }, data: { lastSuccessAt: new Date() } });
  },
  markError: async (id, message) => {
    await prisma.pushSubscription.update({ where: { id }, data: { lastErrorAt: new Date(), lastError: message } });
  },
};
