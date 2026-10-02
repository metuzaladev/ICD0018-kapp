import { SLOT_STEP_MINUTES, type BookingsQuery, type BookingWithDiscount, type BookingWithRedemptionInput } from '@kapp/shared';

import { ConflictError, NotFoundError } from '../../http/errors';
import { localDate } from '../../lib/calendar';
import { isExclusionViolation, isUniqueViolation } from '../../lib/db-errors';
import { withTimeout } from '../../lib/timeout';
import type { DogsRepository } from '../dogs/dogs.repository';
import type { Logger, Notifier } from '../notifications/notifier';
import type { ProvidersRepository } from '../providers/providers.repository';
import { type BookingReminders } from './booking-reminders';
import { bookableWindow, CANCEL_CUTOFF_HOURS, cancelUntil, effectiveStatus, reminderTime } from './booking-rules';
import type { ShopRepository } from '../shop/shop.repository';
import { RedemptionUnavailableError, type BookingRecord, type BookingsRepository } from './bookings.repository';

/** The user's own bookings: book a free time, list, cancel; plus the reminder the worker sends. */
export interface BookingsService {
  /** M9b: an optional `redemptionId` applies a paw discount (stored price, still no payment). */
  create(userId: string, input: BookingWithRedemptionInput): Promise<BookingWithDiscount>;
  list(userId: string, query: BookingsQuery): Promise<BookingWithDiscount[]>;
  get(userId: string, bookingId: string): Promise<BookingWithDiscount>;
  /** Idempotent: cancelling a cancelled booking returns it unchanged. A used paw-discount code is freed. */
  cancel(userId: string, bookingId: string): Promise<BookingWithDiscount>;
  /** Called by the reminder worker; skips bookings that were cancelled or are already over. */
  sendReminder(bookingId: string): Promise<void>;
}

export const BOOKINGS_LIST_LIMIT = 50;
/** Scheduling a reminder talks to Redis; like the notifier it must not hold the request. */
export const REMINDER_SCHEDULE_TIMEOUT_MS = 2000;

export function createBookingsService({
  bookings,
  providers,
  dogs,
  redemptions,
  notifier,
  reminders,
  log,
  timeoutMs,
  now = () => new Date(),
}: {
  bookings: BookingsRepository;
  /** M9b paw-discount codes (only for the friendly pre-check; the claim itself is atomic in SQL). */
  redemptions?: Pick<ShopRepository, 'findOwn'>;
  providers: Pick<ProvidersRepository, 'findService' | 'findFreeSlots'>;
  dogs: Pick<DogsRepository, 'ownedIds'>;
  notifier: Notifier;
  reminders: BookingReminders;
  log: Logger;
  timeoutMs: number;
  now?: () => Date;
}): BookingsService {
  const t = <T>(p: Promise<T>, label: string, ms = timeoutMs) => withTimeout(p, ms, label);

  function toBooking(record: BookingRecord): BookingWithDiscount {
    const current = now();
    const status = effectiveStatus(record.status, record.endsAt, current);
    const until = cancelUntil(record.startsAt);
    return {
      id: record.id,
      status,
      startsAt: record.startsAt.toISOString(),
      endsAt: record.endsAt.toISOString(),
      timeZone: record.provider.timeZone,
      note: record.note,
      priceCents: record.priceCents,
      priceIsFrom: record.priceIsFrom,
      provider: {
        id: record.provider.id,
        name: record.provider.name,
        category: record.provider.category,
        area: record.provider.area,
        address: record.provider.address,
      },
      service: record.service,
      dogs: record.dogs,
      cancellable: status === 'confirmed' && current.getTime() <= until.getTime(),
      cancelUntil: until.toISOString(),
      cancelledAt: record.cancelledAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      discount: record.discount ?? null,
    };
  }

  /** What the feed row and the push need; texts are rendered per language from these. */
  const notificationData = (b: BookingRecord) => ({
    bookingId: b.id,
    providerName: b.provider.name,
    serviceName: b.service.name,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
  });

  /** Reminders are a nicety: Redis being down must not fail or slow down a booking. */
  async function bestEffort(promise: Promise<void>, label: string, bookingId: string) {
    try {
      await t(promise, label, REMINDER_SCHEDULE_TIMEOUT_MS);
    } catch (error) {
      log.warn({ err: error, bookingId }, `${label} failed`);
    }
  }

  return {
    async create(userId, { serviceId, startsAt, dogIds, note, redemptionId }) {
      const service = await t(providers.findService(serviceId), 'providers.findService');
      if (!service) throw new NotFoundError('errors.serviceNotFound');
      if (redemptionId) {
        // Friendly answers first; the repository claims the code atomically with the booking anyway.
        const code = redemptions ? await t(redemptions.findOwn(userId, redemptionId), 'redemptions.findOwn') : null;
        if (!code) throw new NotFoundError('errors.redemptionNotFound');
        const usable =
          code.status === 'active' && code.offerType === 'booking' && code.provider.id === service.provider.id && code.expiresAt.getTime() > now().getTime();
        if (!usable) throw new ConflictError('errors.redemptionUnavailable');
      }
      // Only the user's own dogs; a foreign id is "not found", the same as a missing one.
      const owned = await t(dogs.ownedIds(userId, dogIds), 'dogs.ownedIds');
      if (owned.length !== dogIds.length) throw new NotFoundError('errors.dogNotFound');

      // The start must be one of the times the slot list offers right now: inside opening hours,
      // on the grid, after the cutoff, within the horizon and free. Re-using the same query keeps
      // "what you see" and "what you can book" identical. Past times end up here too.
      const start = new Date(startsAt);
      const current = now();
      const window = bookableWindow(current);
      if (start < window.notBefore || start > window.notAfter) throw new ConflictError('errors.slotUnavailable');
      const day = localDate(start, service.provider.timeZone);
      const free = await t(
        providers.findFreeSlots({ serviceId, from: day, days: 1, stepMinutes: SLOT_STEP_MINUTES, ...window }),
        'providers.findFreeSlots',
      );
      const slot = free.find((s) => s.startsAt.getTime() === start.getTime());
      if (!slot) throw new ConflictError('errors.slotUnavailable');

      let created: BookingRecord;
      try {
        created = await t(
          bookings.create({
            userId,
            providerId: service.provider.id,
            serviceId,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            note,
            priceCents: service.priceCents,
            priceIsFrom: service.priceIsFrom,
            dogIds,
            ...(redemptionId ? { redemptionId } : {}),
          }),
          'bookings.create',
        );
      } catch (error) {
        // Someone booked an overlapping time between our check and the insert: the exclusion
        // constraint lets exactly one through.
        if (isExclusionViolation(error, 'bookings_no_overlap')) throw new ConflictError('errors.slotTaken');
        // The code was used, cancelled or expired between the check and the insert.
        if (error instanceof RedemptionUnavailableError || isUniqueViolation(error, 'bookings_redemption_uq')) {
          throw new ConflictError('errors.redemptionUnavailable');
        }
        throw error;
      }

      // The user sees the confirmation on screen; the feed keeps a record (no push to the same phone).
      await notifier.notify({ type: 'booking_confirmed', recipientId: userId, actorId: null, data: notificationData(created), push: false });
      const remindAt = reminderTime(created.startsAt, current);
      if (remindAt) await bestEffort(reminders.schedule(created.id, remindAt), 'reminders.schedule', created.id);
      return toBooking(created);
    },

    async list(userId, { scope }) {
      const records =
        scope === 'upcoming'
          ? await t(bookings.listUpcoming(userId, BOOKINGS_LIST_LIMIT), 'bookings.listUpcoming')
          : await t(bookings.listPast(userId, BOOKINGS_LIST_LIMIT), 'bookings.listPast');
      return records.map(toBooking);
    },

    async get(userId, bookingId) {
      const record = await t(bookings.findOwn(userId, bookingId), 'bookings.findOwn');
      if (!record) throw new NotFoundError('errors.bookingNotFound');
      return toBooking(record);
    },

    async cancel(userId, bookingId) {
      const record = await t(bookings.findOwn(userId, bookingId), 'bookings.findOwn');
      if (!record) throw new NotFoundError('errors.bookingNotFound');
      if (record.status === 'cancelled') return toBooking(record);
      if (!toBooking(record).cancellable) throw new ConflictError('errors.cancelTooLate', { hours: CANCEL_CUTOFF_HOURS });

      const changed = await t(bookings.cancel(userId, bookingId), 'bookings.cancel');
      const updated = await t(bookings.findOwn(userId, bookingId), 'bookings.findOwn');
      if (!updated) throw new NotFoundError('errors.bookingNotFound');
      // Only the request that actually cancelled it tells about it (a parallel double tap is quiet).
      if (changed) {
        await notifier.notify({ type: 'booking_cancelled', recipientId: userId, actorId: null, data: notificationData(updated), push: false });
        await bestEffort(reminders.cancel(bookingId), 'reminders.cancel', bookingId);
      }
      return toBooking(updated);
    },

    async sendReminder(bookingId) {
      const record = await t(bookings.findById(bookingId), 'bookings.findById');
      // A late job (Redis was down) after the start would only confuse: skip it like a cancelled one.
      if (!record || record.status !== 'confirmed' || record.startsAt.getTime() <= now().getTime()) return;
      await notifier.notify({ type: 'booking_reminder', recipientId: record.userId, actorId: null, data: notificationData(record) });
    },
  };
}
