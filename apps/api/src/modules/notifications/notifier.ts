import type { NotificationData, NotificationType } from '@kapp/shared';

import { withTimeout } from '../../lib/timeout';
import type { RealtimeGateway } from '../../realtime/socket-gateway';
import type { NotificationsRepository } from './notifications.repository';
import { composePush, PREFERENCE_FOR } from './push-messages';
import type { PushQueue } from './push-queue';

export interface NotifyEvent {
  type: NotificationType;
  recipientId: string;
  /** Who caused it; null for the user's own bookings (M6), which have no other person. */
  actorId: string | null;
  data: NotificationData;
  /**
   * false = feed row and realtime event only. Used when the recipient caused it on this very phone
   * (booking confirmed / cancelled): a push would just repeat what the screen already shows.
   */
  push?: boolean;
}

/**
 * The single entry point other modules use to tell someone something happened:
 *   1. a row in the activity feed (`notifications`),
 *   2. a realtime `notification:new` event with the new unread count (tab badge),
 *   3. a push job in the recipient's language — only if their preference for the type is on.
 *
 * It never throws. The user action that caused it (a message, a friend request) has already been
 * saved; a failing notification must not turn that into an error, so failures are only logged.
 */
export interface Notifier {
  notify(event: NotifyEvent): Promise<void>;
}

export interface Logger {
  warn(obj: object, msg: string): void;
}

export const silentLogger: Logger = { warn: () => {} };

/** Redis being slow must not hold the request that caused the notification. */
export const ENQUEUE_TIMEOUT_MS = 2000;

export function createNotifier({
  notifications,
  realtime,
  pushQueue,
  log,
  timeoutMs,
}: {
  notifications: Pick<NotificationsRepository, 'create' | 'upsertMessageNotification' | 'unreadCount' | 'pushContext'>;
  realtime: RealtimeGateway;
  pushQueue: Pick<PushQueue, 'enqueue'>;
  log: Logger;
  timeoutMs: number;
}): Notifier {
  const t = <T>(p: Promise<T>, label: string, ms = timeoutMs) => withTimeout(p, ms, label);

  return {
    async notify({ type, recipientId, actorId, data, push = true }) {
      try {
        const input = { userId: recipientId, type, actorId, data };
        const notification =
          type === 'message' && data.conversationId
            ? await t(notifications.upsertMessageNotification({ ...input, data: { ...data, conversationId: data.conversationId } }), 'notifications.upsert')
            : await t(notifications.create(input), 'notifications.create');
        const unreadCount = await t(notifications.unreadCount(recipientId), 'notifications.unreadCount');
        realtime.emitToUsers([recipientId], 'notification:new', { notification, unreadCount });

        if (!push) return;
        const context = await t(notifications.pushContext(recipientId), 'notifications.pushContext');
        if (!context || !context.preferences[PREFERENCE_FOR[type]]) return;
        const { title, body } = composePush(context.language, type, notification.actor?.firstName ?? '', data);
        const pushData: Record<string, string> = { type, notificationId: notification.id };
        if (data.conversationId) pushData.conversationId = data.conversationId;
        if (actorId && (type === 'friend_request' || type === 'friend_accepted' || type === 'friend_plan')) pushData.userId = actorId;
        if (data.bookingId) pushData.bookingId = data.bookingId;
        await t(pushQueue.enqueue({ userId: recipientId, language: context.language, title, body, data: pushData }), 'push.enqueue', ENQUEUE_TIMEOUT_MS);
      } catch (error) {
        log.warn({ err: error, type, recipientId }, 'notification not delivered');
      }
    },
  };
}
