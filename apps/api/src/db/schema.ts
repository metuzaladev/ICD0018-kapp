import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  foreignKey,
  geometry,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* ------------------------------------------------------------------ */
/* Auth — column layout follows Better Auth's core schema (user,       */
/* session, account, verification). Verify with `npx @better-auth/cli  */
/* generate` when auth is wired up (milestone M1).                     */
/* ------------------------------------------------------------------ */

export const presenceSharing = pgEnum('presence_sharing', ['nobody', 'friends', 'everyone']);

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // Käpp profile fields (Better Auth `additionalFields`)
  area: text('area'),
  bio: text('bio'),
  presenceSharing: presenceSharing('presence_sharing').notNull().default('friends'),
  /** Settings / Privacy "Luba sõbrakutseid" (M5). Off = nobody can send this user a friend request. */
  allowFriendRequests: boolean('allow_friend_requests').notNull().default(true),
  /**
   * The app's language (M5). Push notifications are composed on the server, away from any
   * request, so the recipient's language must be stored; the app sends it with its push token.
   */
  language: text('language').$type<'et' | 'en' | 'ru'>().notNull().default('et'),
  ...timestamps,
}, (t) => [check('user_language_supported', sql`${t.language} in ('et', 'en', 'ru')`)]);

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  ...timestamps,
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  ...timestamps,
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* Dogs & health — screens 04 / Dogs & Health                          */
/* ------------------------------------------------------------------ */

export const dogSex = pgEnum('dog_sex', ['male', 'female']);

export const dogs = pgTable(
  'dogs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    breed: text('breed'),
    sex: dogSex('sex'),
    birthDate: date('birth_date'),
    weightKg: numeric('weight_kg', { precision: 5, scale: 2 }),
    temperament: text('temperament'),
    /**
     * Profile picture as a reference to one of the dog's photos (replaces the unused photo_key).
     * Why a foreign key and not a copied object key: deleting the photo clears it in the database
     * itself (`set null`), so a dog can never point at deleted objects, and the photo's thumbnail
     * comes for free. That the photo belongs to the same dog is checked in the update statement.
     */
    profilePhotoId: uuid('profile_photo_id').references((): AnyPgColumn => dogPhotos.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('dogs_owner_idx').on(t.ownerId)],
);

export const healthRecordKind = pgEnum('health_record_kind', ['vaccination', 'vet_visit']);

/** Private to the owner — never exposed through social endpoints. */
export const healthRecords = pgTable(
  'health_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dogId: uuid('dog_id')
      .notNull()
      .references(() => dogs.id, { onDelete: 'cascade' }),
    kind: healthRecordKind('kind').notNull(),
    title: text('title').notNull(),
    date: date('date').notNull(),
    nextDue: date('next_due'),
    clinic: text('clinic'),
    notes: text('notes'),
    documentKey: text('document_key'),
    ...timestamps,
  },
  (t) => [
    index('health_records_dog_idx').on(t.dogId),
    // The next due date follows the event; also enforced for PATCHes that change only one side.
    check('health_records_next_due_after_date', sql`${t.nextDue} is null or ${t.nextDue} > ${t.date}`),
  ],
);

export const dogPhotos = pgTable(
  'dog_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dogId: uuid('dog_id')
      .notNull()
      .references(() => dogs.id, { onDelete: 'cascade' }),
    /** Re-encoded WebP, longer side ≤ 1600 px: `dogs/<dogId>/<photoId>/full.webp`. */
    imageKey: text('image_key').notNull(),
    /** ≤ 400 px for grids and avatars: `dogs/<dogId>/<photoId>/thumb.webp`. */
    thumbnailKey: text('thumbnail_key').notNull(),
    caption: text('caption'),
    createdAt: timestamps.createdAt,
  },
  // Listing is always "this dog's photos, newest first".
  (t) => [index('dog_photos_dog_created_idx').on(t.dogId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Parks, visits, reviews, reports — screens 02, 03, 06 (Add Park)      */
/* ------------------------------------------------------------------ */

export const parkStatus = pgEnum('park_status', ['pending', 'approved', 'rejected']);

export const parks = pgTable(
  'parks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    address: text('address'),
    location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }).notNull(),
    fenced: boolean('fenced').notNull().default(false),
    smallDogArea: boolean('small_dog_area').notNull().default(false),
    water: boolean('water').notNull().default(false),
    lighting: boolean('lighting').notNull().default(false),
    photoKey: text('photo_key'),
    status: parkStatus('status').notNull().default('pending'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('parks_location_gist').using('gist', t.location), index('parks_status_idx').on(t.status)],
);

/** "Märgi kohalolek" — always time-boxed; a scheduled job closes expired rows. */
export const checkIns = pgTable(
  'check_ins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parkId: uuid('park_id')
      .notNull()
      .references(() => parks.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    index('check_ins_park_active_idx').on(t.parkId, t.expiresAt),
    index('check_ins_user_idx').on(t.userId),
    // At most one open check-in per user. A new check-in closes the previous one in the same
    // transaction; this index makes a concurrent double check-in fail instead of duplicating.
    uniqueIndex('check_ins_one_open_per_user_uq')
      .on(t.userId)
      .where(sql`${t.endedAt} is null`),
  ],
);

export const checkInDogs = pgTable(
  'check_in_dogs',
  {
    checkInId: uuid('check_in_id')
      .notNull()
      .references(() => checkIns.id, { onDelete: 'cascade' }),
    dogId: uuid('dog_id')
      .notNull()
      .references(() => dogs.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.checkInId, t.dogId] })],
);

export const plannedVisits = pgTable(
  'planned_visits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parkId: uuid('park_id')
      .notNull()
      .references(() => parks.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    note: text('note'),
    ...timestamps,
  },
  (t) => [
    index('planned_visits_park_time_idx').on(t.parkId, t.startsAt),
    // Friends' plans on Home (M5): "plans of these users in the next 48 hours".
    index('planned_visits_user_time_idx').on(t.userId, t.startsAt),
  ],
);

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parkId: uuid('park_id')
      .notNull()
      .references(() => parks.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    body: text('body'),
    ...timestamps,
  },
  (t) => [
    index('reviews_park_idx').on(t.parkId),
    // One review per user per park; writing again updates it (upsert).
    uniqueIndex('reviews_user_park_uq').on(t.userId, t.parkId),
    check('reviews_rating_range', sql`${t.rating} between 1 and 5`),
  ],
);

export const favoriteParks = pgTable(
  'favorite_parks',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parkId: uuid('park_id')
      .notNull()
      .references(() => parks.id, { onDelete: 'cascade' }),
    createdAt: timestamps.createdAt,
  },
  (t) => [primaryKey({ columns: [t.userId, t.parkId] })],
);

export const reportStatus = pgEnum('report_status', ['open', 'resolved', 'dismissed']);

export const parkReports = pgTable('park_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  parkId: uuid('park_id')
    .notNull()
    .references(() => parks.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  description: text('description').notNull(),
  photoKey: text('photo_key'),
  status: reportStatus('status').notNull().default('open'),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* Community — screens 05 / Friends & Messages, 08 / Community Safety   */
/* ------------------------------------------------------------------ */

export const friendshipStatus = pgEnum('friendship_status', ['pending', 'accepted']);

/**
 * Mutual friendship with a request (M5): a row is a pending request from requester to addressee
 * until the addressee accepts it. Either side can delete it (decline, cancel or unfriend).
 */
export const friendships = pgTable(
  'friendships',
  {
    requesterId: text('requester_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    addresseeId: text('addressee_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: friendshipStatus('status').notNull().default('pending'),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.requesterId, t.addresseeId] }),
    // One row per pair in EITHER direction: A→B and B→A can never both exist, so two people who
    // ask each other at the same moment cannot end up with two requests (the second insert fails
    // and the service accepts the first one instead).
    uniqueIndex('friendships_pair_uq').on(
      sql`least(${t.requesterId}, ${t.addresseeId})`,
      sql`greatest(${t.requesterId}, ${t.addresseeId})`,
    ),
    index('friendships_addressee_idx').on(t.addresseeId),
    check('friendships_not_self', sql`${t.requesterId} <> ${t.addresseeId}`),
  ],
);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  /**
   * `least(a,b) + ':' + greatest(a,b)` for a 1:1 conversation (M5). Unique, so two friends always
   * share exactly one conversation, even when both open it for the first time simultaneously.
   * Null is reserved for group conversations, which do not exist yet.
   */
  directKey: text('direct_key').unique(),
  ...timestamps,
});

export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Messages after this are unread for the member; null = never opened. */
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index('conversation_members_user_idx').on(t.userId)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: text('sender_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index('messages_conversation_time_idx').on(t.conversationId, t.createdAt),
    // Same limits as messageInputSchema, also for writes that bypass the API.
    check('messages_body_length', sql`char_length(${t.body}) between 1 and 2000`),
  ],
);

export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: text('blocker_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    // "Has anyone blocked anyone" is checked in both directions in many queries.
    index('user_blocks_blocked_idx').on(t.blockedId),
    check('user_blocks_not_self', sql`${t.blockerId} <> ${t.blockedId}`),
  ],
);

export const userReports = pgTable(
  'user_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: text('reporter_id').references(() => user.id, { onDelete: 'set null' }),
    reportedId: text('reported_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    /** "Mis juhtus?" — free text for the moderator (M5). */
    details: text('details'),
    status: reportStatus('status').notNull().default('open'),
    ...timestamps,
  },
  (t) => [check('user_reports_reason', sql`${t.reason} in ('spam', 'harassment', 'other')`)],
);

/**
 * Activity feed rows (M5). No texts are stored: the app renders each type in its own language
 * from `actor_id` and `data`, and the push worker does the same in the recipient's language.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    /** Who caused it (sender, requester, friend who planned); deleting the account removes the row. */
    actorId: text('actor_id').references(() => user.id, { onDelete: 'cascade' }),
    data: jsonb('data').$type<Record<string, string>>().notNull().default({}),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index('notifications_user_time_idx').on(t.userId, t.createdAt),
    check('notifications_type', sql`${t.type} in ('friend_request', 'friend_accepted', 'message', 'friend_plan', 'booking_confirmed', 'booking_cancelled', 'booking_reminder')`),
  ],
);

/** Per-type push preferences (Settings / Notifications). A missing row means "everything on". */
export const notificationPreferences = pgTable('notification_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  messages: boolean('messages').notNull().default(true),
  friendRequests: boolean('friend_requests').notNull().default(true),
  friendPlans: boolean('friend_plans').notNull().default(true),
  /** Figma "Broneeringute uuendused" (M6): booking reminders. */
  bookings: boolean('bookings').notNull().default(true),
  updatedAt: timestamps.updatedAt,
});

export const pushTokens = pgTable(
  'push_tokens',
  {
    /** Expo push token; one device = one token, re-registering on another account moves it. */
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [index('push_tokens_user_idx').on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Services & bookings — screens 06 / Services & Contributions          */
/* ------------------------------------------------------------------ */

export const serviceCategory = pgEnum('service_category', ['grooming', 'training', 'vet', 'other']);

/**
 * A business that offers dog services (M6, docs/13-teenused.md). Managed by the Käpp team (seed /
 * admin), not by provider accounts: there is no provider sign-up in the app.
 */
export const serviceProviders = pgTable(
  'service_providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    category: serviceCategory('category').notNull(),
    /** Figma "Rahulik hoolitsus" — a short headline above the description. */
    tagline: text('tagline'),
    description: text('description'),
    /** City district shown in lists ("Kadriorg"); the full address is on the detail screen. */
    area: text('area').notNull(),
    address: text('address'),
    location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }).notNull(),
    /** Opening hours are wall-clock times in this zone; slots are computed in it (DST-safe). */
    timeZone: text('time_zone').notNull().default('Europe/Tallinn'),
    /** Optional picture in the private photo bucket (signed URL on read), like dog photos. */
    photoKey: text('photo_key'),
    /**
     * Curated rating from the provider's public reviews. Käpp has no provider reviews (yet), so this
     * is informational data kept with the provider record, not computed from our tables.
     */
    ratingAverage: numeric('rating_average', { precision: 2, scale: 1, mode: 'number' }),
    ratingCount: integer('rating_count').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('service_providers_location_gist').using('gist', t.location),
    index('service_providers_category_idx').on(t.category),
    check('service_providers_rating_range', sql`${t.ratingAverage} is null or ${t.ratingAverage} between 1 and 5`),
    check('service_providers_rating_count', sql`${t.ratingCount} >= 0`),
  ],
);

/**
 * Weekly opening hours (wall-clock time in the provider's zone). Several rows per weekday allow a
 * lunch break. Bookable slots are generated from these on read, so no slot table must be kept filled.
 */
export const providerHours = pgTable(
  'provider_hours',
  {
    providerId: uuid('provider_id')
      .notNull()
      .references(() => serviceProviders.id, { onDelete: 'cascade' }),
    /** ISO weekday: 1 = Monday … 7 = Sunday (Postgres `extract(isodow …)`). */
    weekday: integer('weekday').notNull(),
    opensAt: time('opens_at').notNull(),
    closesAt: time('closes_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.providerId, t.weekday, t.opensAt] }),
    check('provider_hours_weekday', sql`${t.weekday} between 1 and 7`),
    check('provider_hours_order', sql`${t.closesAt} > ${t.opensAt}`),
  ],
);

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => serviceProviders.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    durationMinutes: integer('duration_minutes').notNull(),
    /** Euro cents (integer: no floating-point money). Informational only — payment is out of scope. */
    priceCents: integer('price_cents').notNull(),
    /** "alates 35 €": the final price depends on the dog and is agreed with the provider. */
    priceIsFrom: boolean('price_is_from').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('services_provider_idx').on(t.providerId),
    // Target of the composite foreign key from bookings: a booking's service belongs to its provider.
    uniqueIndex('services_id_provider_uq').on(t.id, t.providerId),
    check('services_duration_range', sql`${t.durationMinutes} between 5 and 480`),
    check('services_price_nonnegative', sql`${t.priceCents} >= 0`),
  ],
);

/**
 * Stored states. "completed" is derived on read (confirmed + ended), like check-in expiry, so no job
 * has to flip rows; the stored value is reserved for a future provider-side "done / no-show" flow.
 */
export const bookingStatus = pgEnum('booking_status', ['confirmed', 'cancelled', 'completed']);

/**
 * A booked time with a provider. Bookings are confirmed immediately (there is no provider-side
 * approval). `provider_id` is denormalised from the service so the database itself can forbid
 * overlapping bookings per provider — the `bookings_no_overlap` exclusion constraint, added in SQL in
 * migration 0006_m6_services because drizzle cannot express EXCLUDE.
 */
export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    providerId: uuid('provider_id').notNull(),
    serviceId: uuid('service_id').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    note: text('note'),
    /** Price at booking time, so a later price change does not rewrite history. */
    priceCents: integer('price_cents').notNull(),
    priceIsFrom: boolean('price_is_from').notNull(),
    status: bookingStatus('status').notNull().default('confirmed'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('bookings_user_time_idx').on(t.userId, t.startsAt),
    // restrict: a service with bookings cannot vanish from someone's history. The composite key also
    // guarantees provider_id matches the service, which the overlap constraint relies on.
    foreignKey({
      columns: [t.serviceId, t.providerId],
      foreignColumns: [services.id, services.providerId],
      name: 'bookings_service_provider_fk',
    }).onDelete('restrict'),
    check('bookings_time_order', sql`${t.endsAt} > ${t.startsAt}`),
    check('bookings_note_length', sql`${t.note} is null or char_length(${t.note}) <= 300`),
    check('bookings_cancelled_at', sql`(${t.status} = 'cancelled') = (${t.cancelledAt} is not null)`),
  ],
);

/** Which of the user's dogs come along (like check_in_dogs). */
export const bookingDogs = pgTable(
  'booking_dogs',
  {
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    dogId: uuid('dog_id')
      .notNull()
      .references(() => dogs.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.bookingId, t.dogId] }), index('booking_dogs_dog_idx').on(t.dogId)],
);

/* ------------------------------------------------------------------ */

export const parksRelations = relations(parks, ({ many }) => ({
  checkIns: many(checkIns),
  reviews: many(reviews),
}));

export const dogsRelations = relations(dogs, ({ one, many }) => ({
  owner: one(user, { fields: [dogs.ownerId], references: [user.id] }),
  healthRecords: many(healthRecords),
  photos: many(dogPhotos),
}));
