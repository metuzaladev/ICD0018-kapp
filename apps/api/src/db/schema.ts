import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  geometry,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
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
  ...timestamps,
});

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
    photoKey: text('photo_key'),
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
  (t) => [index('health_records_dog_idx').on(t.dogId)],
);

export const dogPhotos = pgTable(
  'dog_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dogId: uuid('dog_id')
      .notNull()
      .references(() => dogs.id, { onDelete: 'cascade' }),
    imageKey: text('image_key').notNull(),
    caption: text('caption'),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('dog_photos_dog_idx').on(t.dogId)],
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
  (t) => [index('check_ins_park_active_idx').on(t.parkId, t.expiresAt), index('check_ins_user_idx').on(t.userId)],
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
  (t) => [index('planned_visits_park_time_idx').on(t.parkId, t.startsAt)],
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
  (t) => [primaryKey({ columns: [t.requesterId, t.addresseeId] })],
);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
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
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
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
  (t) => [index('messages_conversation_time_idx').on(t.conversationId, t.createdAt)],
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
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

export const userReports = pgTable('user_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: text('reporter_id').references(() => user.id, { onDelete: 'set null' }),
  reportedId: text('reported_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  status: reportStatus('status').notNull().default('open'),
  ...timestamps,
});

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    data: text('data'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('notifications_user_time_idx').on(t.userId, t.createdAt)],
);

export const pushTokens = pgTable(
  'push_tokens',
  {
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('push_tokens_user_idx').on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Services & bookings — screens 06 / Services & Contributions          */
/* ------------------------------------------------------------------ */

export const serviceCategory = pgEnum('service_category', ['grooming', 'training', 'vet', 'other']);

export const serviceProviders = pgTable(
  'service_providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    category: serviceCategory('category').notNull(),
    description: text('description'),
    address: text('address'),
    location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }),
    ...timestamps,
  },
  (t) => [index('service_providers_location_gist').using('gist', t.location)],
);

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => serviceProviders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  priceFromCents: integer('price_from_cents'),
});

export const bookingStatus = pgEnum('booking_status', ['requested', 'confirmed', 'cancelled', 'completed']);

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    dogId: uuid('dog_id')
      .notNull()
      .references(() => dogs.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    note: text('note'),
    status: bookingStatus('status').notNull().default('requested'),
    ...timestamps,
  },
  (t) => [
    index('bookings_user_idx').on(t.userId),
    // One active booking per service slot; cancelled bookings free the slot again.
    uniqueIndex('bookings_service_slot_uq')
      .on(t.serviceId, t.startsAt)
      .where(sql`${t.status} <> 'cancelled'`),
  ],
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
