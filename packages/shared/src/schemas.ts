import { z } from 'zod';

import { issueMessage } from './validation';

/**
 * Request/response contracts shared by apps/api and apps/mobile.
 *
 * Why here: the API validates every input with these schemas and the app uses the inferred types,
 * so a contract change breaks the build on both sides instead of failing at runtime.
 *
 * Conventions:
 * - Body schemas are `.strict()`: unknown fields are rejected, so a client can never set
 *   server-owned columns (status, createdBy, …) — protection against mass assignment.
 * - Query/params schemas use `z.coerce` because URLs only carry strings; bodies never coerce,
 *   a JSON number must arrive as a number.
 * - Every string has a max length, so oversized input is rejected before it reaches the database.
 */

/* ---------- errors ---------- */

/** The only error shape the API returns. `message` is safe to show to the user, in the request's Accept-Language (default Estonian). */
export const apiErrorSchema = z.object({
  error: z.literal(true),
  message: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/* ---------- shared pieces ---------- */

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

/** Optional free text for create: trims; missing, "" and null all become null (no empty strings in the DB). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/**
 * Optional free text for partial updates: a missing field stays undefined (= "do not change"),
 * while "" or null explicitly clears it. Using optionalText here would wipe fields on every PATCH.
 */
const patchText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v ? v : null))
    .optional(); // makes the key optional in the inferred type, matching "not sent = unchanged"

/* ---------- parks ---------- */

export const parkIdParamsSchema = z.object({
  parkId: z.uuid(),
});
export type ParkIdParams = z.infer<typeof parkIdParamsSchema>;

/** Feature filters from the "Filtrid" screen; only `true` narrows the result (false = don't care). */
const featureFlag = z.stringbool().optional();

export const nearbyParksQuerySchema = z.object({
  lat: z.coerce.number().pipe(latitude),
  lng: z.coerce.number().pipe(longitude),
  radiusKm: z.coerce.number().positive().max(50).default(5),
  fenced: featureFlag,
  smallDogArea: featureFlag,
  water: featureFlag,
  lighting: featureFlag,
});
export type NearbyParksQuery = z.infer<typeof nearbyParksQuerySchema>;
export type ParkFeatureFilters = Pick<NearbyParksQuery, 'fenced' | 'smallDogArea' | 'water' | 'lighting'>;

/** "Lisa koerapark" form. New parks are always created as `pending` and moderated. */
export const createParkInputSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: optionalText(1000),
    address: optionalText(200),
    lat: latitude,
    lng: longitude,
    fenced: z.boolean().default(false),
    smallDogArea: z.boolean().default(false),
    water: z.boolean().default(false),
    lighting: z.boolean().default(false),
  })
  .strict();
export type CreateParkInput = z.infer<typeof createParkInputSchema>;

export const parkStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const parkSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  address: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  fenced: z.boolean(),
  smallDogArea: z.boolean(),
  water: z.boolean(),
  lighting: z.boolean(),
  status: parkStatusSchema,
  distanceKm: z.number().optional(),
  activeDogs: z.number().int().nonnegative().optional(),
});
export type Park = z.infer<typeof parkSchema>;

/** GET /api/v1/parks/:parkId — adds review summary and, for signed-in users, favourite state. */
export const parkDetailSchema = parkSchema.extend({
  ratingAverage: z.number().nullable(),
  reviewCount: z.number().int().nonnegative(),
  isFavorite: z.boolean().optional(),
});
export type ParkDetail = z.infer<typeof parkDetailSchema>;

/* ---------- auth & profile (M1) ---------- */

/**
 * Field rules mirror the Better Auth server config (apps/api/src/modules/auth/auth.ts):
 * passwords 8–128 characters. `issueMessage` keys are translated by `fieldErrors` / `describeFirstIssue`.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const email = z.string().trim().toLowerCase().pipe(z.email(issueMessage('validation.email'))).pipe(z.string().max(254));
const password = z
  .string()
  .min(PASSWORD_MIN, issueMessage('validation.minChars', { min: PASSWORD_MIN }))
  .max(PASSWORD_MAX, issueMessage('validation.maxChars', { max: PASSWORD_MAX }));
const personName = z.string().trim().min(2, issueMessage('validation.minChars', { min: 2 })).max(60, issueMessage('validation.maxChars', { max: 60 }));

export const signUpInputSchema = z.object({ name: personName, email, password }).strict();
export type SignUpInput = z.infer<typeof signUpInputSchema>;

export const signInInputSchema = z.object({ email, password: z.string().min(1, issueMessage('validation.passwordRequired')) }).strict();
export type SignInInput = z.infer<typeof signInInputSchema>;

export const requestPasswordResetInputSchema = z.object({ email }).strict();

export const resetPasswordInputSchema = z.object({ token: z.string().min(1), newPassword: password }).strict();

export const presenceSharingSchema = z.enum(['nobody', 'friends', 'everyone']);
export type PresenceSharing = z.infer<typeof presenceSharingSchema>;

/** What the signed-in user sees about themselves (GET /api/v1/me). */
export const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  area: z.string().nullable(),
  bio: z.string().nullable(),
  presenceSharing: presenceSharingSchema,
});
export type Profile = z.infer<typeof profileSchema>;

/**
 * PATCH /api/v1/me. Every field optional (partial update) but at least one is required.
 * Email and password are intentionally absent: they change through Better Auth flows that
 * re-verify the user, never through a plain profile update.
 */
export const updateProfileInputSchema = z
  .object({
    name: personName.optional(),
    area: patchText(60),
    bio: patchText(300),
    presenceSharing: presenceSharingSchema.optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: issueMessage('validation.changeAtLeastOne') });
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

/* ---------- dogs (basic profile in M3; photos and health in M4) ---------- */

export const dogSexSchema = z.enum(['male', 'female']);
export type DogSex = z.infer<typeof dogSexSchema>;

/** Not in the future and not older than 30 years — catches typos like 2062 or 1925. */
const birthDate = z.iso
  .date(issueMessage('validation.dateFormat'))
  .refine((d) => d <= new Date().toISOString().slice(0, 10), issueMessage('validation.birthDateFuture'))
  .refine((d) => Number(d.slice(0, 4)) >= new Date().getFullYear() - 30, issueMessage('validation.checkYear'));

const dogFields = {
  name: z.string().trim().min(1, issueMessage('validation.nameRequired')).max(40, issueMessage('validation.maxChars', { max: 40 })),
  breed: optionalText(80),
  sex: dogSexSchema.nullish().transform((v) => v ?? null),
  birthDate: birthDate.nullish().transform((v) => v ?? null),
  weightKg: z.number().positive(issueMessage('validation.weightPositive')).max(120, issueMessage('validation.checkWeight')).nullish().transform((v) => v ?? null),
  temperament: optionalText(500),
};

export const dogInputSchema = z.object(dogFields).strict();
export type DogInput = z.infer<typeof dogInputSchema>;

/** PATCH: every field optional; same "missing = unchanged, null = clear" rule as the profile. */
export const updateDogInputSchema = z
  .object({
    name: dogFields.name.optional(),
    breed: patchText(80),
    sex: dogSexSchema.nullish(),
    birthDate: birthDate.nullish(),
    weightKg: z.number().positive().max(120).nullish(),
    temperament: patchText(500),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: issueMessage('validation.changeAtLeastOne') });
export type UpdateDogInput = z.infer<typeof updateDogInputSchema>;

export const dogIdParamsSchema = z.object({ dogId: z.uuid() });

/** Short-lived signed URLs (photos are private): `url` ~1600 px, `thumbnailUrl` ~400 px. */
export const imageUrlsSchema = z.object({ url: z.url(), thumbnailUrl: z.url() });
export type ImageUrls = z.infer<typeof imageUrlsSchema>;

export const dogSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  breed: z.string().nullable(),
  sex: dogSexSchema.nullable(),
  birthDate: z.string().nullable(),
  weightKg: z.number().nullable(),
  temperament: z.string().nullable(),
  /** The photo chosen as profile picture, or null. (M4) */
  profilePhoto: imageUrlsSchema.nullable(),
});
export type Dog = z.infer<typeof dogSchema>;

/** Upper bound per owner: protects the API and covers every real household. */
export const MAX_DOGS_PER_USER = 10;

/* ---------- dog photos (M4) ----------
 * Upload flow (images never pass through the API body — 64 KB limit):
 *   1. POST /me/dogs/:dogId/photos/uploads  {contentType, byteSize}  → PhotoUpload (presigned PUT)
 *   2. client PUTs the file bytes to `url` with `headers`
 *   3. POST /me/dogs/:dogId/photos {uploadKey, caption?} → DogPhoto
 *      The server checks the object (owner prefix, size, real image), re-encodes it (which strips
 *      EXIF incl. GPS — a dog photo must not reveal the owner's home), stores 1600 px + 400 px
 *      versions and deletes the raw upload.
 */

export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_DOG = 50;

export const createPhotoUploadInputSchema = z
  .object({
    contentType: z.enum(PHOTO_CONTENT_TYPES, issueMessage('validation.photoType')),
    byteSize: z.number().int().positive().max(MAX_PHOTO_BYTES, issueMessage('validation.photoTooLarge', { max: MAX_PHOTO_BYTES / 1024 / 1024 })),
  })
  .strict();
export type CreatePhotoUploadInput = z.infer<typeof createPhotoUploadInputSchema>;

export const photoUploadSchema = z.object({
  /** Opaque key of the raw upload, scoped to the user: `uploads/<userId>/<uuid>`. */
  uploadKey: z.string(),
  url: z.url(),
  /** Headers the PUT must send exactly (they are part of the signature). */
  headers: z.record(z.string(), z.string()),
  expiresAt: z.string(),
});
export type PhotoUpload = z.infer<typeof photoUploadSchema>;

export const addDogPhotoInputSchema = z
  .object({
    uploadKey: z.string().regex(/^uploads\/[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}$/, issueMessage('validation.uploadKey')),
    caption: optionalText(200),
  })
  .strict();
export type AddDogPhotoInput = z.infer<typeof addDogPhotoInputSchema>;

export const dogPhotoParamsSchema = z.object({ dogId: z.uuid(), photoId: z.uuid() });

export const dogPhotoSchema = imageUrlsSchema.extend({
  id: z.uuid(),
  caption: z.string().nullable(),
  createdAt: z.string(),
});
export type DogPhoto = z.infer<typeof dogPhotoSchema>;

/** PUT /me/dogs/:dogId/profile-photo — null removes the profile picture. */
export const setProfilePhotoInputSchema = z.object({ photoId: z.uuid().nullable() }).strict();

/* ---------- health records (M4) — private to the owner, never exposed elsewhere ---------- */

export const healthRecordKindSchema = z.enum(['vaccination', 'vet_visit']);
export type HealthRecordKind = z.infer<typeof healthRecordKindSchema>;

const today = () => new Date().toISOString().slice(0, 10);
const recordDate = z.iso.date(issueMessage('validation.dateFormat'));

const healthFields = {
  kind: healthRecordKindSchema,
  title: z.string().trim().min(1, issueMessage('validation.titleRequired')).max(120, issueMessage('validation.maxChars', { max: 120 })),
  /** When it happened — a record of the past, so not in the future. */
  date: recordDate.refine((d) => d <= today(), issueMessage('validation.dateFuture')),
  /** Next vaccination / check-up; drives the reminders list. */
  nextDue: recordDate.nullish().transform((v) => v ?? null),
  clinic: optionalText(120),
  notes: optionalText(2000),
};

export const healthRecordInputSchema = z
  .object(healthFields)
  .strict()
  .refine((v) => !v.nextDue || v.nextDue > v.date, { path: ['nextDue'], message: issueMessage('validation.nextDueAfterDate') });
export type HealthRecordInput = z.infer<typeof healthRecordInputSchema>;

export const updateHealthRecordInputSchema = z
  .object({
    kind: healthFields.kind.optional(),
    title: healthFields.title.optional(),
    date: healthFields.date.optional(),
    nextDue: recordDate.nullish(),
    clinic: patchText(120),
    notes: patchText(2000),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: issueMessage('validation.changeAtLeastOne') });
export type UpdateHealthRecordInput = z.infer<typeof updateHealthRecordInputSchema>;

export const healthRecordParamsSchema = z.object({ dogId: z.uuid(), recordId: z.uuid() });

export const healthRecordSchema = z.object({
  id: z.uuid(),
  dogId: z.uuid(),
  kind: healthRecordKindSchema,
  title: z.string(),
  date: z.string(),
  nextDue: z.string().nullable(),
  clinic: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type HealthRecord = z.infer<typeof healthRecordSchema>;

/** GET /me/health-reminders — due within REMINDER_WINDOW_DAYS or overdue, across all own dogs. */
export const REMINDER_WINDOW_DAYS = 30;
export const healthReminderSchema = z.object({
  recordId: z.uuid(),
  dog: z.object({ id: z.uuid(), name: z.string() }),
  kind: healthRecordKindSchema,
  title: z.string(),
  nextDue: z.string(),
  overdue: z.boolean(),
});
export type HealthReminder = z.infer<typeof healthReminderSchema>;

/* ---------- visits: check-ins, plans, history (M3) ---------- */

export const CHECK_IN_DURATIONS = [30, 60, 90, 120] as const;

/** "Märgi kohalolek". Always time-boxed (15–180 min, design default 60) so presence never goes stale. */
export const checkInInputSchema = z
  .object({
    parkId: z.uuid(),
    dogIds: z
      .array(z.uuid())
      .min(1, issueMessage('validation.chooseDog'))
      .max(MAX_DOGS_PER_USER)
      .refine((ids) => new Set(ids).size === ids.length, issueMessage('validation.duplicateDog')),
    durationMinutes: z.number().int().min(15).max(180).default(60),
  })
  .strict();
export type CheckInInput = z.infer<typeof checkInInputSchema>;

export const checkInIdParamsSchema = z.object({ checkInId: z.uuid() });

const dogSummary = z.object({ id: z.uuid(), name: z.string(), breed: z.string().nullable() });

export const activeCheckInSchema = z.object({
  id: z.uuid(),
  park: z.object({ id: z.uuid(), name: z.string() }),
  dogs: z.array(dogSummary),
  startedAt: z.string(),
  expiresAt: z.string(),
});
export type ActiveCheckIn = z.infer<typeof activeCheckInSchema>;

/** Someone currently in a park, as the viewer is allowed to see them. */
export const parkVisitorSchema = z.object({
  checkInId: z.uuid(),
  isMe: z.boolean(),
  /** First name only — enough to recognise a park friend, less personal data shown to strangers. */
  ownerFirstName: z.string(),
  dogs: z.array(dogSummary),
  until: z.string(),
});
export type ParkVisitor = z.infer<typeof parkVisitorSchema>;

export const parkVisitorsSchema = z.object({
  visitors: z.array(parkVisitorSchema),
  /** Dogs of people who do not share their presence with the viewer — counted, never named. */
  hiddenDogs: z.number().int().nonnegative(),
});
export type ParkVisitors = z.infer<typeof parkVisitorsSchema>;

export const visitHistoryItemSchema = z.object({
  id: z.uuid(),
  park: z.object({ id: z.uuid(), name: z.string() }),
  startedAt: z.string(),
  endedAt: z.string(),
  durationMinutes: z.number().int().nonnegative(),
  dogs: z.array(dogSummary),
  hasReview: z.boolean(),
});
export type VisitHistoryItem = z.infer<typeof visitHistoryItemSchema>;

/** Planning horizon and length limits keep plans meaningful ("today 17–18", not "next year"). */
export const PLAN_MAX_DAYS_AHEAD = 30;
export const PLAN_MAX_HOURS = 4;

export const plannedVisitInputSchema = z
  .object({
    parkId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true, message: issueMessage('validation.startInvalid') }),
    endsAt: z.iso.datetime({ offset: true, message: issueMessage('validation.endInvalid') }),
    note: optionalText(200),
  })
  .strict()
  .superRefine((v, ctx) => {
    const start = Date.parse(v.startsAt);
    const end = Date.parse(v.endsAt);
    // 5 minutes of slack: "now" on the phone and on the server are never exactly equal.
    if (start < Date.now() - 5 * 60_000) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: issueMessage('validation.startInPast') });
    if (start > Date.now() + PLAN_MAX_DAYS_AHEAD * 86_400_000)
      ctx.addIssue({ code: 'custom', path: ['startsAt'], message: issueMessage('validation.planMaxDays', { max: PLAN_MAX_DAYS_AHEAD }) });
    if (end <= start) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: issueMessage('validation.endBeforeStart') });
    if (end - start > PLAN_MAX_HOURS * 3_600_000)
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: issueMessage('validation.planMaxHours', { max: PLAN_MAX_HOURS }) });
  });
export type PlannedVisitInput = z.infer<typeof plannedVisitInputSchema>;

export const plannedVisitIdParamsSchema = z.object({ planId: z.uuid() });

export const plannedVisitSchema = z.object({
  id: z.uuid(),
  park: z.object({ id: z.uuid(), name: z.string() }),
  startsAt: z.string(),
  endsAt: z.string(),
  note: z.string().nullable(),
});
export type PlannedVisit = z.infer<typeof plannedVisitSchema>;

/* ---------- reviews & reports (M3) ---------- */

export const reviewInputSchema = z
  .object({
    rating: z.number().int().min(1, issueMessage('validation.rating')).max(5, issueMessage('validation.rating')),
    body: optionalText(1000),
  })
  .strict();
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const reviewSchema = z.object({
  id: z.uuid(),
  authorFirstName: z.string(),
  rating: z.number().int(),
  body: z.string().nullable(),
  createdAt: z.string(),
});
export type Review = z.infer<typeof reviewSchema>;

/** "Märkasid probleemi?" — hazard report; long enough to be actionable for a moderator. */
export const parkReportInputSchema = z
  .object({
    description: z.string().trim().min(10, issueMessage('validation.describeMin', { min: 10 })).max(1000, issueMessage('validation.maxChars', { max: 1000 })),
  })
  .strict();
export type ParkReportInput = z.infer<typeof parkReportInputSchema>;
