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

/** Optional free text: trims, turns "" and null into null so the database never stores empty strings. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/* ---------- parks ---------- */

export const parkIdParamsSchema = z.object({
  parkId: z.uuid(),
});
export type ParkIdParams = z.infer<typeof parkIdParamsSchema>;

export const nearbyParksQuerySchema = z.object({
  lat: z.coerce.number().pipe(latitude),
  lng: z.coerce.number().pipe(longitude),
  radiusKm: z.coerce.number().positive().max(50).default(5),
});
export type NearbyParksQuery = z.infer<typeof nearbyParksQuerySchema>;

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

/* ---------- dogs & visits (used from M3/M4) ---------- */

export const dogSexSchema = z.enum(['male', 'female']);

export const dogInputSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    breed: optionalText(80),
    sex: dogSexSchema.nullish(),
    birthDate: z.iso.date().nullish(),
    weightKg: z.number().positive().max(120).nullish(),
    temperament: optionalText(500),
  })
  .strict();
export type DogInput = z.infer<typeof dogInputSchema>;

/** Check-ins expire automatically; the app offers 15–180 minutes (design default 60). */
export const checkInInputSchema = z
  .object({
    parkId: z.uuid(),
    dogIds: z.array(z.uuid()).min(1).max(10),
    durationMinutes: z.number().int().min(15).max(180).default(60),
  })
  .strict();
export type CheckInInput = z.infer<typeof checkInInputSchema>;
