import { z } from 'zod';

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

/** The only error shape the API returns. `message` is safe to show to the user (Estonian UI). */
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
 * passwords 8–128 characters. Messages prefixed with `kapp:` are shown as-is by `fieldErrors`.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const email = z.string().trim().toLowerCase().pipe(z.email('kapp:sisesta korrektne e-posti aadress')).pipe(z.string().max(254));
const password = z
  .string()
  .min(PASSWORD_MIN, `kapp:vähemalt ${PASSWORD_MIN} märki`)
  .max(PASSWORD_MAX, `kapp:kuni ${PASSWORD_MAX} märki`);
const personName = z.string().trim().min(2, 'kapp:vähemalt 2 märki').max(60, 'kapp:kuni 60 märki');

export const signUpInputSchema = z.object({ name: personName, email, password }).strict();
export type SignUpInput = z.infer<typeof signUpInputSchema>;

export const signInInputSchema = z.object({ email, password: z.string().min(1, 'kapp:sisesta parool') }).strict();
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
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'kapp:muuda vähemalt üht välja' });
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

/* ---------- dogs (basic profile in M3; photos and health in M4) ---------- */

export const dogSexSchema = z.enum(['male', 'female']);
export type DogSex = z.infer<typeof dogSexSchema>;

/** Not in the future and not older than 30 years — catches typos like 2062 or 1925. */
const birthDate = z.iso
  .date('kapp:kuupäev kujul AAAA-KK-PP')
  .refine((d) => d <= new Date().toISOString().slice(0, 10), 'kapp:sünnipäev ei saa olla tulevikus')
  .refine((d) => Number(d.slice(0, 4)) >= new Date().getFullYear() - 30, 'kapp:kontrolli aastat');

const dogFields = {
  name: z.string().trim().min(1, 'kapp:sisesta nimi').max(40, 'kapp:kuni 40 märki'),
  breed: optionalText(80),
  sex: dogSexSchema.nullish().transform((v) => v ?? null),
  birthDate: birthDate.nullish().transform((v) => v ?? null),
  weightKg: z.number().positive('kapp:kaal peab olema positiivne').max(120, 'kapp:kontrolli kaalu').nullish().transform((v) => v ?? null),
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
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'kapp:muuda vähemalt üht välja' });
export type UpdateDogInput = z.infer<typeof updateDogInputSchema>;

export const dogIdParamsSchema = z.object({ dogId: z.uuid() });

export const dogSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  breed: z.string().nullable(),
  sex: dogSexSchema.nullable(),
  birthDate: z.string().nullable(),
  weightKg: z.number().nullable(),
  temperament: z.string().nullable(),
});
export type Dog = z.infer<typeof dogSchema>;

/** Upper bound per owner: protects the API and covers every real household. */
export const MAX_DOGS_PER_USER = 10;

/* ---------- visits: check-ins, plans, history (M3) ---------- */

export const CHECK_IN_DURATIONS = [30, 60, 90, 120] as const;

/** "Märgi kohalolek". Always time-boxed (15–180 min, design default 60) so presence never goes stale. */
export const checkInInputSchema = z
  .object({
    parkId: z.uuid(),
    dogIds: z
      .array(z.uuid())
      .min(1, 'kapp:vali vähemalt üks koer')
      .max(MAX_DOGS_PER_USER)
      .refine((ids) => new Set(ids).size === ids.length, 'kapp:sama koer on valitud kaks korda'),
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
    startsAt: z.iso.datetime({ offset: true, message: 'kapp:vigane algusaeg' }),
    endsAt: z.iso.datetime({ offset: true, message: 'kapp:vigane lõpuaeg' }),
    note: optionalText(200),
  })
  .strict()
  .superRefine((v, ctx) => {
    const start = Date.parse(v.startsAt);
    const end = Date.parse(v.endsAt);
    // 5 minutes of slack: "now" on the phone and on the server are never exactly equal.
    if (start < Date.now() - 5 * 60_000) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'kapp:algus ei saa olla minevikus' });
    if (start > Date.now() + PLAN_MAX_DAYS_AHEAD * 86_400_000)
      ctx.addIssue({ code: 'custom', path: ['startsAt'], message: `kapp:planeeri kuni ${PLAN_MAX_DAYS_AHEAD} päeva ette` });
    if (end <= start) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'kapp:lõpp peab olema pärast algust' });
    if (end - start > PLAN_MAX_HOURS * 3_600_000)
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: `kapp:kuni ${PLAN_MAX_HOURS} tundi` });
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
    rating: z.number().int().min(1, 'kapp:vali 1–5').max(5, 'kapp:vali 1–5'),
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
    description: z.string().trim().min(10, 'kapp:kirjelda vähemalt 10 märgiga').max(1000, 'kapp:kuni 1000 märki'),
  })
  .strict();
export type ParkReportInput = z.infer<typeof parkReportInputSchema>;
