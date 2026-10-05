import type { NotificationPage, NotificationPreferences, NotificationsQuery, PushTokenInput } from '@kapp/shared';

import { NotFoundError } from '../../http/errors';
import { withTimeout } from '../../lib/timeout';
import type { NotificationsRepository, PushTokensRepository } from './notifications.repository';

/** The user's own activity feed, push preferences and push tokens (Notifications / Activity, Settings). */
export interface NotificationsService {
  list(userId: string, query: NotificationsQuery): Promise<NotificationPage>;
  unreadCount(userId: string): Promise<{ count: number }>;
  markRead(userId: string, notificationId: string): Promise<void>;
  markAllRead(userId: string): Promise<void>;
  getPreferences(userId: string): Promise<NotificationPreferences>;
  setPreferences(userId: string, preferences: NotificationPreferences): Promise<NotificationPreferences>;
  registerPushToken(userId: string, input: PushTokenInput): Promise<void>;
  unregisterPushToken(userId: string, token: string): Promise<void>;
}

export function createNotificationsService({
  notifications,
  tokens,
  timeoutMs,
}: {
  notifications: NotificationsRepository;
  tokens: PushTokensRepository;
  timeoutMs: number;
}): NotificationsService {
  const t = <T>(p: Promise<T>, label: string) => withTimeout(p, timeoutMs, label);

  return {
    list: (userId, { before, limit }) => t(notifications.list(userId, before, limit), 'notifications.list'),

    unreadCount: async (userId) => ({ count: await t(notifications.unreadCount(userId), 'notifications.unreadCount') }),

    async markRead(userId, notificationId) {
      // Someone else's notification id is "not found" (no enumeration); reading twice is fine.
      if (!(await t(notifications.markRead(userId, notificationId), 'notifications.markRead'))) {
        throw new NotFoundError('errors.notificationNotFound');
      }
    },

    markAllRead: (userId) => t(notifications.markAllRead(userId), 'notifications.markAllRead'),

    getPreferences: (userId) => t(notifications.getPreferences(userId), 'notifications.getPreferences'),

    setPreferences: (userId, preferences) => t(notifications.setPreferences(userId, preferences), 'notifications.setPreferences'),

    registerPushToken: (userId, input) => t(tokens.upsert({ userId, ...input }), 'pushTokens.upsert'),

    unregisterPushToken: (userId, token) => t(tokens.remove(userId, token), 'pushTokens.remove'),
  };
}
