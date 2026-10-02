import { z } from 'zod';

import { notificationDataSchema, notificationPreferencesSchema, notificationsQuerySchema, notificationTypeSchema } from './community';
import { bookingInputSchema, bookingSchema, providerSummarySchema } from './services';
import { imageUrlsSchema } from './schemas';
import { issueMessage } from './validation';

/**
 * Contracts for M9b "Avasta, Käpad ja Pood": community place posts, the map pins, Käpad reward
 * points and the partner shop (docs/16-avasta-ja-kapad.md). Same conventions as schemas.ts: bodies
 * are `.strict()`, query/params coerce, every string has a maximum length.
 *
 * Why a separate file that extends a few M5/M6 schemas instead of editing them: the M9a app
 * refresh changes the app in parallel, and the current app must keep compiling and working against
 * this API (new notification types are opt-in, the reward preference is optional, see below).
 */

/* ---------- shared pieces ---------- */

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, issueMessage('validation.maxChars', { max }))
    .nullish()
    .transform((v) => (v ? v : null));

/** Newest-first paging, like notifications: `before` = id of the last item already shown. */
const pageQuery = {
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};

/**
 * Rough bounding box of Estonia including the islands (Ruhnu, Vilsandi, Narva). Place posts must lie
 * inside it — Käpp is a Tallinn/Estonia app, and it stops junk coordinates (0,0) at the door. The same
 * box is a CHECK constraint in the database (place_posts_in_estonia).
 */
export const ESTONIA_BBOX = { minLat: 57.3, maxLat: 59.95, minLng: 21.5, maxLng: 28.5 } as const;
export const isInEstonia = (lat: number, lng: number) =>
  lat >= ESTONIA_BBOX.minLat && lat <= ESTONIA_BBOX.maxLat && lng >= ESTONIA_BBOX.minLng && lng <= ESTONIA_BBOX.maxLng;

/* ---------- place posts (Avasta) ---------- */

export const PLACE_CATEGORIES = ['cafe', 'park', 'beach', 'shop', 'other'] as const;
export const placeCategorySchema = z.enum(PLACE_CATEGORIES);
export type PlaceCategory = z.infer<typeof placeCategorySchema>;

/**
 * Amenities a recommender can tick. Extensible: a new value is appended here and to the Postgres enum
 * (`ALTER TYPE place_amenity ADD VALUE`); old app builds simply do not show an icon for it.
 */
export const PLACE_AMENITIES = ['dogs_inside', 'water_bowl', 'terrace', 'dog_treats', 'fenced_area', 'off_leash', 'shade', 'stream'] as const;
export const placeAmenitySchema = z.enum(PLACE_AMENITIES);
export type PlaceAmenity = z.infer<typeof placeAmenitySchema>;

export const PLACE_POST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const placePostStatusSchema = z.enum(PLACE_POST_STATUSES);
export type PlacePostStatus = z.infer<typeof placePostStatusSchema>;

export const PLACE_NAME_MIN = 2;
export const PLACE_NAME_MAX = 80;
export const PLACE_ADDRESS_MAX = 200;
export const PLACE_POST_BODY_MAX = 1000;
export const PLACE_POST_MAX_PHOTOS = 5;

const uploadKey = z.string().regex(/^uploads\/[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}$/, issueMessage('validation.uploadKey'));

/**
 * "Soovita kohta". Photos are uploaded first through POST /me/place-posts/uploads (presigned PUT,
 * same flow and limits as dog photos) and listed here by their upload keys. New posts are `pending`
 * until a moderator approves them; only the author sees them before that.
 */
export const createPlacePostInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(PLACE_NAME_MIN, issueMessage('validation.minChars', { min: PLACE_NAME_MIN }))
      .max(PLACE_NAME_MAX, issueMessage('validation.maxChars', { max: PLACE_NAME_MAX })),
    category: placeCategorySchema,
    lat: latitude,
    lng: longitude,
    address: optionalText(PLACE_ADDRESS_MAX),
    amenities: z
      .array(placeAmenitySchema)
      .max(PLACE_AMENITIES.length)
      .refine((list) => new Set(list).size === list.length, issueMessage('validation.duplicateAmenity'))
      .default([]),
    body: optionalText(PLACE_POST_BODY_MAX),
    photoUploadKeys: z
      .array(uploadKey)
      .max(PLACE_POST_MAX_PHOTOS, issueMessage('validation.maxPhotos', { max: PLACE_POST_MAX_PHOTOS }))
      .refine((keys) => new Set(keys).size === keys.length, issueMessage('validation.duplicatePhoto'))
      .default([]),
  })
  .strict()
  .refine((v) => isInEstonia(v.lat, v.lng), { path: ['lat'], message: issueMessage('validation.outsideEstonia') });
export type CreatePlacePostInput = z.infer<typeof createPlacePostInputSchema>;

export const placePostIdParamsSchema = z.object({ postId: z.uuid() });

export const PLACE_FEED_SCOPES = ['all', 'friends'] as const;

/**
 * GET /place-posts — the Avasta feed: approved posts (plus the viewer's own pending ones), newest
 * first. With lat/lng only posts within `radiusKm` are listed and each carries `distanceKm`;
 * `scope=friends` keeps posts of accepted friends.
 */
export const placePostsQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().max(50).default(15),
    category: placeCategorySchema.optional(),
    scope: z.enum(PLACE_FEED_SCOPES).default('all'),
    ...pageQuery,
  })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), { path: ['lat'], message: issueMessage('validation.bothCoordinates') });
export type PlacePostsQuery = z.infer<typeof placePostsQuerySchema>;

export const savedPlacePostsQuerySchema = z.object(pageQuery);
export type SavedPlacePostsQuery = z.infer<typeof savedPlacePostsQuerySchema>;

export const placePostSchema = z.object({
  id: z.uuid(),
  /** First name only, like reviews and park visitors. */
  author: z.object({ id: z.string(), firstName: z.string() }),
  isMine: z.boolean(),
  name: z.string(),
  category: placeCategorySchema,
  lat: z.number(),
  lng: z.number(),
  address: z.string().nullable(),
  amenities: z.array(placeAmenitySchema),
  body: z.string().nullable(),
  /** Short-lived signed URLs (private bucket), WebP, EXIF/GPS stripped. */
  photos: z.array(imageUrlsSchema),
  /** Others only ever see `approved`; the author also sees `pending` and `rejected`. */
  status: placePostStatusSchema,
  likeCount: z.number().int().nonnegative(),
  liked: z.boolean(),
  saved: z.boolean(),
  /** Only when the feed was asked with a location. */
  distanceKm: z.number().optional(),
  createdAt: z.string(),
});
export type PlacePost = z.infer<typeof placePostSchema>;

export const placePostPageSchema = z.object({ items: z.array(placePostSchema), nextCursor: z.uuid().nullable() });
export type PlacePostPage = z.infer<typeof placePostPageSchema>;

/** Result of PUT/DELETE …/like and …/save — the new state, so the app needs no refetch. */
export const placePostReactionsSchema = z.object({ liked: z.boolean(), saved: z.boolean(), likeCount: z.number().int().nonnegative() });
export type PlacePostReactions = z.infer<typeof placePostReactionsSchema>;

export const PLACE_REPORT_REASONS = ['spam', 'inappropriate', 'wrong_info', 'other'] as const;

export const placePostReportInputSchema = z
  .object({
    reason: z.enum(PLACE_REPORT_REASONS),
    details: optionalText(1000),
  })
  .strict()
  .refine((v) => v.reason !== 'other' || (v.details?.length ?? 0) >= 10, {
    path: ['details'],
    message: issueMessage('validation.describeMin', { min: 10 }),
  });
export type PlacePostReportInput = z.infer<typeof placePostReportInputSchema>;

/* ---------- map pins (full-screen map tags) ---------- */

/** Figma tags: Pargid, Kohvikud, Rannad, Teenused, Kliinikud (+ other recommendations). */
export const MAP_TAGS = ['parks', 'cafes', 'beaches', 'services', 'clinics', 'other'] as const;
export const mapTagSchema = z.enum(MAP_TAGS);
export type MapTag = z.infer<typeof mapTagSchema>;

/** One degree is ~110 km north–south: plenty for a city map, small enough to keep responses bounded. */
export const MAP_MAX_SPAN_DEGREES = 1;
export const MAP_PLACES_LIMIT = 300;

export const mapPlacesQuerySchema = z
  .object({
    minLat: z.coerce.number().min(-90).max(90),
    minLng: z.coerce.number().min(-180).max(180),
    maxLat: z.coerce.number().min(-90).max(90),
    maxLng: z.coerce.number().min(-180).max(180),
    /** Comma-separated tags (`parks,cafes`); missing = all. */
    tags: z
      .string()
      .max(100)
      .optional()
      .transform((v, ctx) => {
        if (!v) return undefined;
        const list = [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean))];
        const bad = list.filter((tag) => !(MAP_TAGS as readonly string[]).includes(tag));
        if (bad.length > 0) {
          ctx.addIssue({ code: 'custom', message: issueMessage('validation.mapTags') });
          return z.NEVER;
        }
        return list as MapTag[];
      }),
  })
  .refine((q) => q.maxLat > q.minLat && q.maxLng > q.minLng, { path: ['maxLat'], message: issueMessage('validation.bboxOrder') })
  .refine((q) => q.maxLat - q.minLat <= MAP_MAX_SPAN_DEGREES && q.maxLng - q.minLng <= MAP_MAX_SPAN_DEGREES, {
    path: ['maxLat'],
    message: issueMessage('validation.bboxTooLarge', { max: MAP_MAX_SPAN_DEGREES }),
  });
export type MapPlacesQuery = z.infer<typeof mapPlacesQuerySchema>;

export const mapPlaceSchema = z.object({
  id: z.uuid(),
  /** What the id refers to: GET /parks/:id, /place-posts/:id or /service-providers/:id. */
  kind: z.enum(['park', 'post', 'provider']),
  tag: mapTagSchema,
  /** Place category for posts, service category for providers, `park` for parks. */
  category: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type MapPlace = z.infer<typeof mapPlaceSchema>;

/* ---------- Käpad rewards ---------- */

export const REWARD_REASONS = ['check_in', 'plan_honoured', 'place_post', 'review', 'invite', 'streak', 'redemption', 'redemption_refund'] as const;
export const rewardReasonSchema = z.enum(REWARD_REASONS);
export type RewardReason = z.infer<typeof rewardReasonSchema>;

export const REWARD_LEVEL_IDS = ['puppy', 'park_friend', 'park_legend', 'pack_leader'] as const;
export type RewardLevelId = (typeof REWARD_LEVEL_IDS)[number];

export const REWARD_BADGE_IDS = ['early_bird', 'ten_parks', 'explorer', 'kadriorg_legend'] as const;
export type RewardBadgeId = (typeof REWARD_BADGE_IDS)[number];

export const rewardLevelSchema = z.object({
  id: z.enum(REWARD_LEVEL_IDS),
  /** 0-based position, for "Tase 2". */
  index: z.number().int().nonnegative(),
  minPoints: z.number().int().nonnegative(),
  next: z.object({ id: z.enum(REWARD_LEVEL_IDS), minPoints: z.number().int().positive(), pointsToGo: z.number().int().positive() }).nullable(),
  /** 0…1 towards the next level; 1 at the top level. */
  progress: z.number().min(0).max(1),
});
export type RewardLevel = z.infer<typeof rewardLevelSchema>;

export const rewardsSummarySchema = z.object({
  /** Spendable points. */
  balance: z.number().int().nonnegative(),
  /** Everything ever earned; levels follow this, so spending never lowers a level. */
  lifetimeEarned: z.number().int().nonnegative(),
  level: rewardLevelSchema,
  streak: z.object({
    /** Consecutive Tallinn days with a qualifying check-in, ending today (or yesterday if today has none yet). */
    current: z.number().int().nonnegative(),
    /** Oldest first, the last entry is today (Europe/Tallinn). */
    lastDays: z.array(z.object({ date: z.string(), active: z.boolean() })).length(7),
  }),
  badges: z.array(
    z.object({
      id: z.enum(REWARD_BADGE_IDS),
      unlocked: z.boolean(),
      progress: z.number().int().nonnegative(),
      target: z.number().int().positive(),
    }),
  ),
  /** "Kuidas teenida" — amounts come from the server's rule table, so the app never shows stale numbers. */
  waysToEarn: z.array(z.object({ reason: rewardReasonSchema, points: z.number().int().positive(), dailyLimit: z.number().int().positive().nullable() })),
});
export type RewardsSummary = z.infer<typeof rewardsSummarySchema>;

export const rewardHistoryQuerySchema = z.object(pageQuery);
export type RewardHistoryQuery = z.infer<typeof rewardHistoryQuerySchema>;

export const rewardEntrySchema = z.object({
  id: z.uuid(),
  reason: rewardReasonSchema,
  /** Positive = earned, negative = spent. */
  delta: z.number().int(),
  /** Calendar day in Europe/Tallinn the entry counts for. */
  day: z.string(),
  createdAt: z.string(),
});
export type RewardEntry = z.infer<typeof rewardEntrySchema>;

export const rewardHistoryPageSchema = z.object({ items: z.array(rewardEntrySchema), nextCursor: z.uuid().nullable() });
export type RewardHistoryPage = z.infer<typeof rewardHistoryPageSchema>;

/* ---------- invites ("Kutsu sõber") ---------- */

export const INVITE_CODE = /^[A-HJ-NP-Z2-9]{8}$/;

export const inviteSchema = z.object({ code: z.string(), points: z.number().int().positive() });
export type Invite = z.infer<typeof inviteSchema>;

export const claimInviteInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(INVITE_CODE, issueMessage('validation.inviteCode')),
  })
  .strict();
export type ClaimInviteInput = z.infer<typeof claimInviteInputSchema>;

/* ---------- shop (Pood) and redemptions ---------- */

export const PRODUCT_CATEGORIES = ['food', 'treats', 'toys', 'accessories', 'care'] as const;
export const productCategorySchema = z.enum(PRODUCT_CATEGORIES);
export type ProductCategory = z.infer<typeof productCategorySchema>;

/** The largest paw discount any offer may give (also a CHECK in the database). */
export const MAX_DISCOUNT_PERCENT = 15;
/** Points per percent of discount: −15% costs 150 Käpad. One configurable number, see docs/16. */
export const POINTS_PER_DISCOUNT_PERCENT = 10;
export const redemptionPointsCost = (discountPercent: number) => discountPercent * POINTS_PER_DISCOUNT_PERCENT;
/** A code is valid this long; unused codes can be cancelled for a refund before that. */
export const REDEMPTION_VALID_DAYS = 30;

export const shopQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), { path: ['lat'], message: issueMessage('validation.bothCoordinates') });
export type ShopQuery = z.infer<typeof shopQuerySchema>;

export const shopProductsQuerySchema = z.object({
  category: productCategorySchema.optional(),
  providerId: z.uuid().optional(),
});
export type ShopProductsQuery = z.infer<typeof shopProductsQuerySchema>;

export const productIdParamsSchema = z.object({ productId: z.uuid() });

export const productSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  category: productCategorySchema,
  priceCents: z.number().int().nonnegative(),
  discountPercent: z.number().int().min(1).max(MAX_DISCOUNT_PERCENT),
  /** Rounded to whole cents; informational — paid at the partner, not in the app. */
  discountedPriceCents: z.number().int().nonnegative(),
  pointsCost: z.number().int().positive(),
  imageUrl: z.string().nullable(),
  provider: z.object({ id: z.uuid(), name: z.string(), area: z.string() }),
});
export type Product = z.infer<typeof productSchema>;

/** A service provider that takes paw discounts on bookings. */
export const shopPartnerSchema = providerSummarySchema.extend({
  pawDiscountPercent: z.number().int().min(1).max(MAX_DISCOUNT_PERCENT),
  pointsCost: z.number().int().positive(),
});
export type ShopPartner = z.infer<typeof shopPartnerSchema>;

export const shopSchema = z.object({
  categories: z.array(z.object({ id: productCategorySchema, productCount: z.number().int().nonnegative() })),
  /** Nearest first when a location was given, otherwise by name. */
  partners: z.array(shopPartnerSchema),
  /** A short "Populaarsed" row; the full list is GET /shop/products. */
  products: z.array(productSchema),
});
export type Shop = z.infer<typeof shopSchema>;

export const REDEMPTION_OFFER_TYPES = ['booking', 'product'] as const;

export const redemptionInputSchema = z
  .object({
    /** booking = paw discount on a booking at provider `offerId`; product = product `offerId`. */
    offerType: z.enum(REDEMPTION_OFFER_TYPES),
    offerId: z.uuid(),
    /**
     * Random id the app makes once per tap. A retried request (lost response) with the same key
     * returns the first redemption instead of spending points twice.
     */
    idempotencyKey: z.uuid().optional(),
  })
  .strict();
export type RedemptionInput = z.infer<typeof redemptionInputSchema>;

export const redemptionIdParamsSchema = z.object({ redemptionId: z.uuid() });

export const redemptionStatusSchema = z.enum(['active', 'used', 'cancelled', 'expired']);
export type RedemptionStatus = z.infer<typeof redemptionStatusSchema>;

export const redemptionSchema = z.object({
  id: z.uuid(),
  offerType: z.enum(REDEMPTION_OFFER_TYPES),
  provider: z.object({ id: z.uuid(), name: z.string() }),
  product: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  discountPercent: z.number().int().min(1).max(MAX_DISCOUNT_PERCENT),
  pointsCost: z.number().int().positive(),
  /** Shown to the partner in person; single use. */
  code: z.string(),
  /** `expired` is derived (active and past `expiresAt`). */
  status: redemptionStatusSchema,
  expiresAt: z.string(),
  bookingId: z.uuid().nullable(),
  createdAt: z.string(),
});
export type Redemption = z.infer<typeof redemptionSchema>;

/** POST /me/bookings with an optional paw discount (M9b). Old clients keep sending the M6 body. */
export const bookingWithRedemptionInputSchema = bookingInputSchema.extend({ redemptionId: z.uuid().nullish() }).strict();
export type BookingWithRedemptionInput = z.infer<typeof bookingWithRedemptionInputSchema>;

export const bookingDiscountSchema = z.object({
  redemptionId: z.uuid().nullable(),
  discountPercent: z.number().int().min(1).max(MAX_DISCOUNT_PERCENT),
  /** Price after the discount; still informational — no payment in the app. */
  discountedPriceCents: z.number().int().nonnegative(),
});
export const bookingWithDiscountSchema = bookingSchema.extend({ discount: bookingDiscountSchema.nullable() });
export type BookingWithDiscount = z.infer<typeof bookingWithDiscountSchema>;

/* ---------- notifications for rewards (opt-in for the app) ---------- */

/**
 * New feed types. They are not in `notificationTypeSchema` (community.ts) on purpose: the current app
 * switches over that enum exhaustively and would get rows it cannot render. The feed returns these
 * only with `?include=rewards`, and the realtime event is not sent for them (see docs/16).
 */
export const REWARD_NOTIFICATION_TYPES = ['reward_level_up', 'reward_badge', 'place_post_approved'] as const;
export const anyNotificationTypeSchema = z.enum([...notificationTypeSchema.options, ...REWARD_NOTIFICATION_TYPES]);
export type AnyNotificationType = z.infer<typeof anyNotificationTypeSchema>;
export const isRewardNotificationType = (type: string): boolean => (REWARD_NOTIFICATION_TYPES as readonly string[]).includes(type);

export const rewardNotificationDataSchema = notificationDataSchema.extend({
  levelId: z.enum(REWARD_LEVEL_IDS),
  badgeId: z.enum(REWARD_BADGE_IDS),
  postId: z.uuid(),
  placeName: z.string(),
  /** Points as a decimal string (feed data is stored as text). */
  points: z.string(),
}).partial();
export type RewardNotificationData = z.infer<typeof rewardNotificationDataSchema>;

export const anyNotificationSchema = z.object({
  id: z.uuid(),
  type: anyNotificationTypeSchema,
  actor: z.object({ id: z.string(), firstName: z.string() }).nullable(),
  data: rewardNotificationDataSchema,
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AnyNotification = z.infer<typeof anyNotificationSchema>;

export const anyNotificationPageSchema = z.object({ items: z.array(anyNotificationSchema), nextCursor: z.uuid().nullable() });
export type AnyNotificationPage = z.infer<typeof anyNotificationPageSchema>;

/** GET /me/notifications and /unread-count: `include=rewards` adds the reward types. */
export const notificationsFeedQuerySchema = notificationsQuerySchema.extend({ include: z.enum(['rewards']).optional() });
export type NotificationsFeedQuery = z.infer<typeof notificationsFeedQuerySchema>;
export const unreadCountQuerySchema = z.object({ include: z.enum(['rewards']).optional() });

/**
 * Settings / Notifications with the new "Käpad ja märgid" switch. Optional in the body so the
 * current app (which PUTs the four M6 switches) keeps working; a missing value keeps the stored one.
 */
export const notificationPreferencesInputSchema = notificationPreferencesSchema.extend({ rewards: z.boolean().optional() }).strict();
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesInputSchema>;
export type NotificationPreferencesWithRewards = Required<NotificationPreferencesInput>;
