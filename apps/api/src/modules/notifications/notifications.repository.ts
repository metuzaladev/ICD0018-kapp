import {
  REWARD_NOTIFICATION_TYPES,
  type AnyNotification,
  type AnyNotificationPage,
  type AnyNotificationType,
  type Language,
  type NotificationPreferencesInput,
  type NotificationPreferencesWithRewards,
  type RewardNotificationData,
} from '@kapp/shared';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { notificationPreferences, notifications, pushTokens, user } from '../../db/schema';
import { firstName, notBlockedBetween } from '../safety/block-sql';

export interface NewNotification {
  userId: string;
  type: AnyNotificationType;
  actorId: string | null;
  data: RewardNotificationData;
}

/** Activity feed rows, push preferences and push tokens (all per user). */
export interface NotificationsRepository {
  create(input: NewNotification): Promise<AnyNotification>;
  /**
   * One unread "new message" row per conversation: a second message updates it (preview, time)
   * instead of filling the feed with one row per message.
   */
  upsertMessageNotification(input: NewNotification & { data: { conversationId: string } }): Promise<AnyNotification>;
  /**
   * Newest first; rows caused by someone either side has blocked are left out. M9b reward types
   * only with `includeRewards` (the current app cannot render them, docs/16).
   */
  list(userId: string, before: string | undefined, limit: number, includeRewards?: boolean): Promise<AnyNotificationPage>;
  unreadCount(userId: string, includeRewards?: boolean): Promise<number>;
  /** false if the notification is not the user's (→ 404). Idempotent for already read rows. */
  markRead(userId: string, notificationId: string): Promise<boolean>;
  markAllRead(userId: string): Promise<void>;
  /** Opening a conversation also clears its "new message" notification. */
  markConversationRead(userId: string, conversationId: string): Promise<void>;
  getPreferences(userId: string): Promise<NotificationPreferencesWithRewards>;
  /** A missing `rewards` keeps the stored value (the current app sends only the M6 switches). */
  setPreferences(userId: string, preferences: NotificationPreferencesInput): Promise<NotificationPreferencesWithRewards>;
  /** Language and preferences of a push recipient; null when the account is gone. */
  pushContext(userId: string): Promise<{ language: Language; preferences: NotificationPreferencesWithRewards } | null>;
}

export interface PushTokensRepository {
  /** Registers (or moves) a device token and stores the app language on the user, atomically. */
  upsert(input: { userId: string; token: string; platform: 'ios' | 'android'; language: Language }): Promise<void>;
  /** Only the user's own token is removed; idempotent. */
  remove(userId: string, token: string): Promise<void>;
  listForUser(userId: string): Promise<string[]>;
  /** Tokens Expo reported as DeviceNotRegistered (app uninstalled, permission revoked). */
  removeTokens(tokens: string[]): Promise<void>;
}

const DEFAULT_PREFERENCES: NotificationPreferencesWithRewards = { messages: true, friendRequests: true, friendPlans: true, bookings: true, rewards: true };

const preferenceColumns = {
  messages: notificationPreferences.messages,
  friendRequests: notificationPreferences.friendRequests,
  friendPlans: notificationPreferences.friendPlans,
  bookings: notificationPreferences.bookings,
  rewards: notificationPreferences.rewards,
};

const actor = sql.raw('"notifications"."actor_id"');
const recipient = sql.raw('"notifications"."user_id"');

export function createNotificationsRepository(db: Db): NotificationsRepository {
  const columns = {
    id: notifications.id,
    type: notifications.type,
    actorId: notifications.actorId,
    actorName: user.name,
    data: notifications.data,
    readAt: notifications.readAt,
    createdAt: notifications.createdAt,
  };
  type Row = { id: string; type: string; actorId: string | null; actorName: string | null; data: Record<string, string>; readAt: Date | null; createdAt: Date };

  const toNotification = (r: Row): AnyNotification => ({
    id: r.id,
    type: r.type as AnyNotificationType,
    actor: r.actorId && r.actorName ? { id: r.actorId, firstName: firstName(r.actorName) } : null,
    data: r.data,
    readAt: r.readAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  });

  async function findOne(id: string): Promise<AnyNotification> {
    const [row] = await db.select(columns).from(notifications).leftJoin(user, eq(user.id, notifications.actorId)).where(eq(notifications.id, id));
    if (!row) throw new Error('Notification not readable after write');
    return toNotification(row);
  }

  const unreadOwn = (userId: string) => and(eq(notifications.userId, userId), isNull(notifications.readAt));
  const visible = sql`(${actor} is null or ${notBlockedBetween(recipient, actor)})`;
  const rewardTypes = sql.join(REWARD_NOTIFICATION_TYPES.map((t) => sql`${t}`), sql`, `);
  const typeFilter = (includeRewards: boolean) => (includeRewards ? sql`true` : sql`${notifications.type} not in (${rewardTypes})`);

  return {
    async create({ userId, type, actorId, data }) {
      const [row] = await db.insert(notifications).values({ userId, type, actorId, data: data as Record<string, string> }).returning({ id: notifications.id });
      return findOne(row!.id);
    },

    async upsertMessageNotification({ userId, type, actorId, data }) {
      const [updated] = await db
        .update(notifications)
        .set({ data: data as Record<string, string>, actorId, createdAt: sql`now()` })
        .where(and(unreadOwn(userId), eq(notifications.type, 'message'), sql`${notifications.data}->>'conversationId' = ${data.conversationId}`))
        .returning({ id: notifications.id });
      if (updated) return findOne(updated.id);
      const [row] = await db.insert(notifications).values({ userId, type, actorId, data: data as Record<string, string> }).returning({ id: notifications.id });
      return findOne(row!.id);
    },

    async list(userId, before, limit, includeRewards = false) {
      // Keyset paging on (created_at, id): stable even when rows are added while scrolling.
      const cursor = before
        ? sql`(${notifications.createdAt}, ${notifications.id}) < (select n2.created_at, n2.id from notifications n2 where n2.id = ${before} and n2.user_id = ${userId})`
        : sql`true`;
      const rows = await db
        .select(columns)
        .from(notifications)
        .leftJoin(user, eq(user.id, notifications.actorId))
        .where(and(eq(notifications.userId, userId), visible, typeFilter(includeRewards), cursor))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(limit + 1);
      const items = rows.slice(0, limit).map(toNotification);
      return { items, nextCursor: rows.length > limit ? items[items.length - 1]!.id : null };
    },

    async unreadCount(userId, includeRewards = false) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(unreadOwn(userId), visible, typeFilter(includeRewards)));
      return row?.count ?? 0;
    },

    async markRead(userId, notificationId) {
      const rows = await db
        .update(notifications)
        .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
        .returning({ id: notifications.id });
      return rows.length > 0;
    },

    async markAllRead(userId) {
      await db.update(notifications).set({ readAt: sql`now()` }).where(unreadOwn(userId));
    },

    async markConversationRead(userId, conversationId) {
      await db
        .update(notifications)
        .set({ readAt: sql`now()` })
        .where(and(unreadOwn(userId), eq(notifications.type, 'message'), sql`${notifications.data}->>'conversationId' = ${conversationId}`));
    },

    async getPreferences(userId) {
      const [row] = await db
        .select(preferenceColumns)
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId));
      return row ?? DEFAULT_PREFERENCES;
    },

    async setPreferences(userId, preferences) {
      // `rewards: undefined` must not reach the update set (it would mean "keep" anyway, but say so).
      const { rewards, ...rest } = preferences;
      const values = rewards === undefined ? rest : { ...rest, rewards };
      const [row] = await db
        .insert(notificationPreferences)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: notificationPreferences.userId, set: { ...values, updatedAt: new Date() } })
        .returning(preferenceColumns);
      return row!;
    },

    async pushContext(userId) {
      const [row] = await db
        .select({
          language: user.language,
          ...preferenceColumns,
        })
        .from(user)
        .leftJoin(notificationPreferences, eq(notificationPreferences.userId, user.id))
        .where(eq(user.id, userId));
      if (!row) return null;
      return {
        language: row.language,
        preferences: {
          messages: row.messages ?? DEFAULT_PREFERENCES.messages,
          friendRequests: row.friendRequests ?? DEFAULT_PREFERENCES.friendRequests,
          friendPlans: row.friendPlans ?? DEFAULT_PREFERENCES.friendPlans,
          bookings: row.bookings ?? DEFAULT_PREFERENCES.bookings,
          rewards: row.rewards ?? DEFAULT_PREFERENCES.rewards,
        },
      };
    },
  };
}

export function createPushTokensRepository(db: Db): PushTokensRepository {
  return {
    async upsert({ userId, token, platform, language }) {
      await db.transaction(async (tx) => {
        // A phone that signs into another account keeps its token: the token moves to the new user,
        // so the previous account stops receiving pushes on that device.
        await tx
          .insert(pushTokens)
          .values({ token, userId, platform })
          .onConflictDoUpdate({ target: pushTokens.token, set: { userId, platform, updatedAt: new Date() } });
        await tx.update(user).set({ language }).where(eq(user.id, userId));
      });
    },

    async remove(userId, token) {
      await db.delete(pushTokens).where(and(eq(pushTokens.token, token), eq(pushTokens.userId, userId)));
    },

    async listForUser(userId) {
      const rows = await db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, userId));
      return rows.map((r) => r.token);
    },

    async removeTokens(tokens) {
      if (tokens.length === 0) return;
      await db.delete(pushTokens).where(inArray(pushTokens.token, tokens));
    },
  };
}
