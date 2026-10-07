import { z } from 'zod';

import { issueMessage } from './validation';

/**
 * M11 "Lemmikparkides täna" on Home (docs/18-avalehe-tegevus.md): who is in a park now and how
 * many visits are planned there for the rest of today, split by part of day in Europe/Tallinn.
 * Same conventions as schemas.ts: query params coerce, every string has a maximum length.
 */

/** Parts of a Tallinn day: hommik < 12, päev 12–17, õhtu ≥ 17. */
export const DAY_PARTS = ['morning', 'day', 'evening'] as const;
export const dayPartSchema = z.enum(DAY_PARTS);
export type DayPart = z.infer<typeof dayPartSchema>;

/** Hour (Tallinn wall clock) at which each part starts; a part ends where the next one starts. */
export const DAY_PART_START_HOUR: Record<DayPart, number> = { morning: 0, day: 12, evening: 17 };

/** Home shows favourites (or the nearest parks); ten is far more than fits on the screen. */
export const PARK_ACTIVITY_MAX_IDS = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const parkActivityQuerySchema = z.object({
  /** Comma-separated park ids (1–10, duplicates dropped); the answer keeps this order. */
  ids: z
    .string()
    .max(PARK_ACTIVITY_MAX_IDS * 37 + 10)
    .transform((v, ctx) => {
      const list = [...new Set(v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
      if (list.length === 0 || list.length > PARK_ACTIVITY_MAX_IDS || !list.every((id) => UUID.test(id))) {
        ctx.addIssue({ code: 'custom', message: issueMessage('validation.parkIds', { max: PARK_ACTIVITY_MAX_IDS }) });
        return z.NEVER;
      }
      return list;
    }),
});
export type ParkActivityQuery = z.infer<typeof parkActivityQuerySchema>;

export const parkActivitySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Dogs checked in right now — the same public counter as on the map pin ("6 koera praegu"). */
  activeDogs: z.number().int().min(0),
  /**
   * Planned visits by other people that overlap each part of the rest of today, counted once per
   * person. Only people whose presence the viewer may see are counted (docs/12 → M11). Plans store
   * no dogs, so these are visits, not dogs. A part that is already over is 0.
   */
  planned: z.object({ morning: z.number().int().min(0), day: z.number().int().min(0), evening: z.number().int().min(0) }),
  /** Accepted friends among those planners: first name and the first part they come in. No ids. */
  friends: z.array(z.object({ firstName: z.string(), part: dayPartSchema })),
});
export type ParkActivity = z.infer<typeof parkActivitySchema>;

export const parkActivityResponseSchema = z.object({
  /** Today's date in Europe/Tallinn (YYYY-MM-DD) the counts are for. */
  date: z.string(),
  /** Requested parks that exist and are public, in the requested order (others are left out). */
  parks: z.array(parkActivitySchema),
});
export type ParkActivityResponse = z.infer<typeof parkActivityResponseSchema>;
