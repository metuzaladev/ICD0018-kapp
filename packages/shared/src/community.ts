import { z } from 'zod';

import { LANGUAGES } from './i18n';
import { issueMessage } from './validation';

/**
 * Contracts for M5 "Kogukond": friends, messages, notifications, push tokens, blocking and
 * reporting (docs/12-kogukond.md). Same conventions as schemas.ts: bodies are `.strict()`,
 * query/params coerce, every string has a maximum length.
 */

/* ---------- shared pieces ---------- */

export const languageSchema = z.enum(LANGUAGES);

/**
 * Better Auth user ids are opaque text (not UUIDs). A strict character set keeps junk out of SQL
 * and logs, and gives a clear 400 instead of a confusing 404 for an obviously broken id.
 */
export const userIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, issueMessage('validation.userId'));
export const userIdParamsSchema = z.object({ userId: userIdSchema });

/** Paging for "newest first" lists: `before` is the id of the oldest item already shown. */
const pageQuery = {
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
};

/** How the viewer relates to another person. */
export const relationSchema = z.enum(['none', 'friend', 'outgoing', 'incoming']);
export type Relation = z.infer<typeof relationSchema>;

/**
 * Another person as shown in lists: first name only (like park visitors), area and dog names.
 * Never e-mail, full name or anything else from the account.
 */
export const personSummarySchema = z.object({
  id: z.string(),
  firstName: z.string(),
  area: z.string().nullable(),
  dogNames: z.array(z.string()),
});
export type PersonSummary = z.infer<typeof personSummarySchema>;

/* ---------- people search & public profile ---------- */

export const USER_SEARCH_MIN = 3;
export const USER_SEARCH_LIMIT = 20;

export const userSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(USER_SEARCH_MIN, issueMessage('validation.searchMin', { min: USER_SEARCH_MIN }))
    .max(50, issueMessage('validation.maxChars', { max: 50 })),
});
export type UserSearchQuery = z.infer<typeof userSearchQuerySchema>;

export const userSearchResultSchema = personSummarySchema.extend({
  relation: relationSchema,
  /** false when the person has turned off friend requests ("Luba sõbrakutseid"). */
  acceptsRequests: z.boolean(),
});
export type UserSearchResult = z.infer<typeof userSearchResultSchema>;

/** A dog on someone else's profile. Details beyond name and breed are for friends only. */
export const publicDogSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  breed: z.string().nullable(),
  birthDate: z.string().nullable(),
  temperament: z.string().nullable(),
});
export type PublicDog = z.infer<typeof publicDogSchema>;

/** GET /users/:userId — "Community / Friend Profile". bio and dog details only for friends. */
export const userProfileSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  area: z.string().nullable(),
  bio: z.string().nullable(),
  relation: relationSchema,
  friendsSince: z.string().nullable(),
  acceptsRequests: z.boolean(),
  dogs: z.array(publicDogSchema),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

/* ---------- friends ---------- */

export const friendSchema = personSummarySchema.extend({ since: z.string() });
export type Friend = z.infer<typeof friendSchema>;

export const friendRequestSchema = z.object({ user: personSummarySchema, createdAt: z.string() });
export type FriendRequest = z.infer<typeof friendRequestSchema>;

export const friendRequestsSchema = z.object({
  incoming: z.array(friendRequestSchema),
  outgoing: z.array(friendRequestSchema),
});
export type FriendRequests = z.infer<typeof friendRequestsSchema>;

export const friendRequestInputSchema = z.object({ userId: userIdSchema }).strict();
export type FriendRequestInput = z.infer<typeof friendRequestInputSchema>;

/** 'accepted' when the other person had already asked — asking back simply accepts. */
export const friendRequestResultSchema = z.object({ status: z.enum(['pending', 'accepted']) });
export type FriendRequestResult = z.infer<typeof friendRequestResultSchema>;

/** Friends' upcoming plans for Home ("Täna võiks koos mängida"). */
export const FRIEND_PLANS_HOURS = 48;
export const friendPlanSchema = z.object({
  id: z.uuid(),
  friend: z.object({ id: z.string(), firstName: z.string() }),
  park: z.object({ id: z.uuid(), name: z.string() }),
  startsAt: z.string(),
  endsAt: z.string(),
  note: z.string().nullable(),
});
export type FriendPlan = z.infer<typeof friendPlanSchema>;

/* ---------- messages ---------- */

export const MESSAGE_MAX = 2000;

export const conversationIdParamsSchema = z.object({ conversationId: z.uuid() });

export const startConversationInputSchema = z.object({ userId: userIdSchema }).strict();
export type StartConversationInput = z.infer<typeof startConversationInputSchema>;

export const messageInputSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, issueMessage('validation.messageEmpty'))
      .max(MESSAGE_MAX, issueMessage('validation.maxChars', { max: MESSAGE_MAX })),
  })
  .strict();
export type MessageInput = z.infer<typeof messageInputSchema>;

export const messageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  senderId: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof messageSchema>;

export const messagesQuerySchema = z.object(pageQuery);
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;

export const messagePageSchema = z.object({
  /** Newest first. */
  messages: z.array(messageSchema),
  /** Pass as `before` to load older messages; null when there are none. */
  nextCursor: z.uuid().nullable(),
});
export type MessagePage = z.infer<typeof messagePageSchema>;

export const conversationSchema = z.object({
  id: z.uuid(),
  other: personSummarySchema.pick({ id: true, firstName: true, dogNames: true }),
  lastMessage: messageSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
  /** false when the two are no longer friends: history stays readable, new messages are refused. */
  canMessage: z.boolean(),
});
export type Conversation = z.infer<typeof conversationSchema>;

/* ---------- notifications ---------- */

export const notificationTypeSchema = z.enum([
  'friend_request',
  'friend_accepted',
  'message',
  'friend_plan',
  // M6 bookings (docs/13-teenused.md): the user's own bookings, no actor.
  'booking_confirmed',
  'booking_cancelled',
  'booking_reminder',
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/**
 * What the app needs to render and open a notification. Texts are not stored: the app renders
 * them in its own language from the type and these fields.
 */
export const notificationDataSchema = z
  .object({
    conversationId: z.uuid(),
    preview: z.string(),
    planId: z.uuid(),
    parkId: z.uuid(),
    parkName: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    bookingId: z.uuid(),
    providerName: z.string(),
    serviceName: z.string(),
  })
  .partial();
export type NotificationData = z.infer<typeof notificationDataSchema>;

export const notificationSchema = z.object({
  id: z.uuid(),
  type: notificationTypeSchema,
  actor: z.object({ id: z.string(), firstName: z.string() }).nullable(),
  data: notificationDataSchema,
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AppNotification = z.infer<typeof notificationSchema>;

export const notificationsQuerySchema = z.object(pageQuery);
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;

export const notificationPageSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: z.uuid().nullable(),
});
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export const notificationIdParamsSchema = z.object({ notificationId: z.uuid() });

export const unreadCountSchema = z.object({ count: z.number().int().nonnegative() });
export type UnreadCount = z.infer<typeof unreadCountSchema>;

/** Settings / Notifications. Controls push only; the in-app activity feed always shows everything. */
export const notificationPreferencesSchema = z
  .object({
    messages: z.boolean(),
    friendRequests: z.boolean(),
    friendPlans: z.boolean(),
    /** "Broneeringute uuendused" (M6): booking reminders. */
    bookings: z.boolean(),
  })
  .strict();
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/* ---------- push tokens ---------- */

/** `ExponentPushToken[…]` / `ExpoPushToken[…]` — the same check as Expo.isExpoPushToken, minus raw UUIDs. */
export const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$/;
const expoPushToken = z.string().max(120).regex(EXPO_PUSH_TOKEN, issueMessage('validation.pushToken'));

export const pushTokenInputSchema = z
  .object({
    token: expoPushToken,
    platform: z.enum(['ios', 'android']),
    /** The app's language; push texts are written in it (stored on the user). */
    language: languageSchema,
  })
  .strict();
export type PushTokenInput = z.infer<typeof pushTokenInputSchema>;

export const pushTokenParamsSchema = z.object({ token: expoPushToken });

/* ---------- safety: blocks and reports ---------- */

export const blockedUserSchema = z.object({ id: z.string(), firstName: z.string(), blockedAt: z.string() });
export type BlockedUser = z.infer<typeof blockedUserSchema>;

export const USER_REPORT_REASONS = ['spam', 'harassment', 'other'] as const;

export const userReportInputSchema = z
  .object({
    reason: z.enum(USER_REPORT_REASONS),
    details: z
      .string()
      .trim()
      .max(1000, issueMessage('validation.maxChars', { max: 1000 }))
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .strict()
  // "Muu" says nothing by itself; a moderator needs a description to act on it.
  .refine((v) => v.reason !== 'other' || (v.details?.length ?? 0) >= 10, {
    path: ['details'],
    message: issueMessage('validation.describeMin', { min: 10 }),
  });
export type UserReportInput = z.infer<typeof userReportInputSchema>;

/* ---------- realtime events (Socket.IO, server → client only) ---------- */

export const REALTIME_PATH = '/api/v1/realtime';

export interface RealtimeEvents {
  /** A new message in one of the user's conversations (also the user's own, for other devices). */
  'message:new': (payload: Message) => void;
  /** A new or updated notification for the user; `unreadCount` drives the tab badge. */
  'notification:new': (payload: { notification: AppNotification; unreadCount: number }) => void;
}
