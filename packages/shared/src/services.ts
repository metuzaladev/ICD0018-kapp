import { z } from 'zod';

import { issueMessage } from './validation';

/**
 * Contracts for M6 "Teenused": service providers, bookable times and bookings
 * (docs/13-teenused.md). Same conventions as schemas.ts: bodies are `.strict()`, query/params
 * coerce, every string has a maximum length. Prices are integer euro cents and informational only —
 * there is no payment in the app.
 */

/* ---------- rules shared by the app and the API ---------- */

/**
 * One rule for both directions: a time can be booked, and a booking cancelled, until this many
 * minutes before it starts. Why one number: it is easy to explain ("kuni 2 tundi enne"), it gives the
 * provider the same notice either way, and with no payments a late cancellation costs the user
 * nothing, so a longer cutoff would only stop people from freeing a time they cannot use.
 */
export const BOOKING_CUTOFF_MINUTES = 120;
/** How far ahead times are offered and accepted. */
export const BOOKING_HORIZON_DAYS = 60;
/** Start times are offered on this grid inside opening hours (10.00, 10.30, …). */
export const SLOT_STEP_MINUTES = 30;
/** Days per slots request — a week view, with a little room. */
export const SLOT_QUERY_MAX_DAYS = 14;
/** Dogs per booking: a grooming or training session is per visit, not per kennel. */
export const MAX_BOOKING_DOGS = 3;
export const BOOKING_NOTE_MAX = 300;

/* ---------- providers & services ---------- */

export const SERVICE_CATEGORIES = ['grooming', 'training', 'vet', 'other'] as const;
export const serviceCategorySchema = z.enum(SERVICE_CATEGORIES);
export type ServiceCategory = z.infer<typeof serviceCategorySchema>;

export const providerIdParamsSchema = z.object({ providerId: z.uuid() });
export const serviceIdParamsSchema = z.object({ serviceId: z.uuid() });
export const bookingIdParamsSchema = z.object({ bookingId: z.uuid() });

/**
 * GET /service-providers. Location is optional (lat and lng together): with it the list is ordered
 * by distance within `radiusKm`, without it by name — the app passes Tallinn's centre when the
 * device location is unknown, like the park list.
 */
export const providersQuerySchema = z
  .object({
    category: serviceCategorySchema.optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().max(50).default(25),
  })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), {
    path: ['lat'],
    message: issueMessage('validation.bothCoordinates'),
  });
export type ProvidersQuery = z.infer<typeof providersQuerySchema>;

export const serviceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  durationMinutes: z.number().int().positive(),
  priceCents: z.number().int().nonnegative(),
  /** true → "alates 35 €" (final price agreed with the provider). */
  priceIsFrom: z.boolean(),
});
export type Service = z.infer<typeof serviceSchema>;

/** A provider in the "Services / Discover" list. */
export const providerSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  category: serviceCategorySchema,
  tagline: z.string().nullable(),
  area: z.string(),
  lat: z.number(),
  lng: z.number(),
  photoUrl: z.string().nullable(),
  ratingAverage: z.number().nullable(),
  ratingCount: z.number().int().nonnegative(),
  /** Cheapest service, for "alates 35 €"; null when the provider has no services. */
  priceFromCents: z.number().int().nonnegative().nullable(),
  distanceKm: z.number().optional(),
});
export type ProviderSummary = z.infer<typeof providerSummarySchema>;

/** GET /service-providers/:providerId — "Service / Groomer". */
export const providerDetailSchema = providerSummarySchema.extend({
  description: z.string().nullable(),
  address: z.string().nullable(),
  /** IANA zone of the opening hours and slots, e.g. "Europe/Tallinn". */
  timeZone: z.string(),
  services: z.array(serviceSchema),
});
export type ProviderDetail = z.infer<typeof providerDetailSchema>;

/* ---------- slots ---------- */

/** `from` is a calendar date in the provider's time zone; defaults to today there. */
export const slotsQuerySchema = z.object({
  from: z.iso.date({ message: issueMessage('validation.dateFormat') }).optional(),
  days: z.coerce.number().int().min(1).max(SLOT_QUERY_MAX_DAYS).default(7),
});
export type SlotsQuery = z.infer<typeof slotsQuerySchema>;

export const slotSchema = z.object({ startsAt: z.string(), endsAt: z.string() });
export type Slot = z.infer<typeof slotSchema>;

/** Every requested day is listed, also closed or full ones (empty `slots`), so a picker can grey them out. */
export const slotDaySchema = z.object({ date: z.string(), slots: z.array(slotSchema) });
export type SlotDay = z.infer<typeof slotDaySchema>;

export const serviceSlotsSchema = z.object({
  serviceId: z.uuid(),
  timeZone: z.string(),
  days: z.array(slotDaySchema),
});
export type ServiceSlots = z.infer<typeof serviceSlotsSchema>;

/* ---------- bookings ---------- */

export const bookingInputSchema = z
  .object({
    serviceId: z.uuid(),
    /** One of the offered slot starts; the server checks it against opening hours and other bookings. */
    startsAt: z.iso.datetime({ offset: true, message: issueMessage('validation.startInvalid') }),
    dogIds: z
      .array(z.uuid())
      .min(1, issueMessage('validation.chooseDog'))
      .max(MAX_BOOKING_DOGS, issueMessage('validation.maxDogs', { max: MAX_BOOKING_DOGS }))
      .refine((ids) => new Set(ids).size === ids.length, issueMessage('validation.duplicateDog')),
    /** Figma "Märkus teenusepakkujale". */
    note: z
      .string()
      .trim()
      .max(BOOKING_NOTE_MAX, issueMessage('validation.maxChars', { max: BOOKING_NOTE_MAX }))
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .strict();
export type BookingInput = z.infer<typeof bookingInputSchema>;

export const BOOKING_SCOPES = ['upcoming', 'past'] as const;
/** "Tulevased" = confirmed and not yet over; "Varasemad" = finished or cancelled. */
export const bookingsQuerySchema = z.object({ scope: z.enum(BOOKING_SCOPES).default('upcoming') });
export type BookingsQuery = z.infer<typeof bookingsQuerySchema>;

export const bookingStatusSchema = z.enum(['confirmed', 'cancelled', 'completed']);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

export const bookingSchema = z.object({
  id: z.uuid(),
  /** "completed" = confirmed and already over (derived by the server). */
  status: bookingStatusSchema,
  startsAt: z.string(),
  endsAt: z.string(),
  timeZone: z.string(),
  note: z.string().nullable(),
  /** Price when booked. */
  priceCents: z.number().int().nonnegative(),
  priceIsFrom: z.boolean(),
  provider: z.object({ id: z.uuid(), name: z.string(), category: serviceCategorySchema, area: z.string(), address: z.string().nullable() }),
  service: z.object({ id: z.uuid(), name: z.string(), durationMinutes: z.number().int() }),
  dogs: z.array(z.object({ id: z.uuid(), name: z.string() })),
  /** Whether "Tühista" is still allowed (confirmed and before the cutoff) — the app does not redo the rule. */
  cancellable: z.boolean(),
  /** Last moment to cancel (start − cutoff). */
  cancelUntil: z.string(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Booking = z.infer<typeof bookingSchema>;
