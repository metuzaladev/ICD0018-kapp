import { BOOKING_CUTOFF_MINUTES, BOOKING_HORIZON_DAYS, type BookingStatus } from '@kapp/shared';

/**
 * Time rules of bookings as pure functions of "now", so the slot list, booking and cancelling use
 * exactly the same numbers and unit tests can pin the clock. Explained in docs/13-teenused.md.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The earliest and latest start that can be booked at `now`. */
export function bookableWindow(now: Date): { notBefore: Date; notAfter: Date } {
  return {
    notBefore: new Date(now.getTime() + BOOKING_CUTOFF_MINUTES * MINUTE),
    notAfter: new Date(now.getTime() + BOOKING_HORIZON_DAYS * 24 * HOUR),
  };
}

/** Last moment a booking starting at `startsAt` can be cancelled. */
export function cancelUntil(startsAt: Date): Date {
  return new Date(startsAt.getTime() - BOOKING_CUTOFF_MINUTES * MINUTE);
}

export const CANCEL_CUTOFF_HOURS = BOOKING_CUTOFF_MINUTES / 60;

/** "completed" is not stored when a confirmed booking ends; it is read off the clock. */
export function effectiveStatus(stored: BookingStatus, endsAt: Date, now: Date): BookingStatus {
  return stored === 'confirmed' && endsAt.getTime() <= now.getTime() ? 'completed' : stored;
}

/** Reminders go out this long before the start, the first one that is still far enough ahead. */
export const REMINDER_OFFSETS_MS = [24 * HOUR, 2 * HOUR] as const;
/** A reminder sooner than this after booking would only repeat the confirmation the user just saw. */
export const REMINDER_MIN_DELAY_MS = HOUR;

/**
 * When to remind about a booking made at `now`: 24 h before, or 2 h before when booked later than
 * that, or not at all when even that would arrive within the hour after booking.
 */
export function reminderTime(startsAt: Date, now: Date): Date | null {
  for (const offset of REMINDER_OFFSETS_MS) {
    const at = startsAt.getTime() - offset;
    if (at - now.getTime() >= REMINDER_MIN_DELAY_MS) return new Date(at);
  }
  return null;
}
