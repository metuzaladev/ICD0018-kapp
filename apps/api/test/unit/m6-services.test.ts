import { BOOKING_CUTOFF_MINUTES, bookingInputSchema, providersQuerySchema, slotsQuerySchema } from '@kapp/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, NotFoundError, ServiceUnavailableError } from '../../src/http/errors';
import { addDays, localDate } from '../../src/lib/calendar';
import { isExclusionViolation, isUniqueViolation } from '../../src/lib/db-errors';
import { TimeoutError } from '../../src/lib/timeout';
import { bookableWindow, cancelUntil, effectiveStatus, reminderTime } from '../../src/modules/bookings/booking-rules';
import type { BookingRecord } from '../../src/modules/bookings/bookings.repository';
import { createBookingsService, REMINDER_SCHEDULE_TIMEOUT_MS } from '../../src/modules/bookings/bookings.service';
import { createNotifier, type Notifier } from '../../src/modules/notifications/notifier';
import { composePush, formatBookingStart } from '../../src/modules/notifications/push-messages';
import type { BookableServiceRecord, ProviderDetailRecord, ProviderRecord } from '../../src/modules/providers/providers.repository';
import { createProvidersService } from '../../src/modules/providers/providers.service';
import { mockBookingsRepository, mockDogsRepository, mockNotificationsRepository, mockProvidersRepository, USER_ID } from '../helpers';

afterEach(() => vi.useRealTimers());

const TIMEOUT_MS = 1000;
/** Monday 5 Oct 2026, 10.00 in Tallinn (EEST, UTC+3). */
const NOW = new Date('2026-10-05T07:00:00Z');
const PROVIDER_ID = '0b6f6a52-3c1e-4c1b-9a37-2f1e5d4c3b2a';
const SERVICE_ID = '1c7e7b63-4d2f-4d2c-8b48-3f2e6e5d4c3b';
const BOOKING_ID = '2d8f8c74-5e3a-4e3d-9c59-4a3f7f6e5d4c';
const DOG_ID = '3e9a9d85-6f4b-4f4e-8d6a-5b4a8a7f6e5d';
const HOUR = 3_600_000;

const exclusionViolation = Object.assign(new Error('conflicting key value violates exclusion constraint'), {
  code: '23P01',
  constraint: 'bookings_no_overlap',
});

const providerRecord = (overrides: Partial<ProviderRecord> = {}): ProviderRecord => ({
  id: PROVIDER_ID,
  name: 'Käpakoda',
  category: 'grooming',
  tagline: 'Rahulik hoolitsus',
  area: 'Kadriorg',
  lat: 59.4372,
  lng: 24.7895,
  photoKey: null,
  ratingAverage: 4.9,
  ratingCount: 87,
  priceFromCents: 1200,
  ...overrides,
});

const bookableService = (overrides: Partial<BookableServiceRecord> = {}): BookableServiceRecord => ({
  id: SERVICE_ID,
  name: 'Pesu ja kammimine',
  description: null,
  durationMinutes: 60,
  priceCents: 3500,
  priceIsFrom: true,
  provider: { id: PROVIDER_ID, name: 'Käpakoda', category: 'grooming', area: 'Kadriorg', address: 'Koidula 24', timeZone: 'Europe/Tallinn' },
  ...overrides,
});

/** Tomorrow (Tue 6 Oct) 10.00–11.00 Tallinn. */
const SLOT_START = new Date('2026-10-06T07:00:00Z');
const SLOT_END = new Date('2026-10-06T08:00:00Z');

const bookingRecord = (overrides: Partial<BookingRecord> = {}): BookingRecord => ({
  id: BOOKING_ID,
  userId: USER_ID,
  status: 'confirmed',
  startsAt: SLOT_START,
  endsAt: SLOT_END,
  note: null,
  priceCents: 3500,
  priceIsFrom: true,
  cancelledAt: null,
  createdAt: NOW,
  provider: bookableService().provider,
  service: { id: SERVICE_ID, name: 'Pesu ja kammimine', durationMinutes: 60 },
  dogs: [{ id: DOG_ID, name: 'Freddy' }],
  ...overrides,
});

/* ---------- pure rules ---------- */

describe('booking rules', () => {
  it('bookable window: from the cutoff (2 h) to the horizon (60 days)', () => {
    const { notBefore, notAfter } = bookableWindow(NOW);
    expect(notBefore.getTime() - NOW.getTime()).toBe(BOOKING_CUTOFF_MINUTES * 60_000);
    expect(notAfter.getTime() - NOW.getTime()).toBe(60 * 24 * HOUR);
  });

  it('cancel until = start minus the same cutoff', () => {
    expect(cancelUntil(SLOT_START).toISOString()).toBe('2026-10-06T05:00:00.000Z');
  });

  it('a confirmed booking that has ended reads as completed; cancelled stays cancelled', () => {
    expect(effectiveStatus('confirmed', SLOT_END, new Date(SLOT_END.getTime() - 1))).toBe('confirmed');
    expect(effectiveStatus('confirmed', SLOT_END, SLOT_END)).toBe('completed');
    expect(effectiveStatus('cancelled', SLOT_END, new Date(SLOT_END.getTime() + HOUR))).toBe('cancelled');
  });

  it.each([
    ['booked days ahead → 24 h before', 72, -24],
    ['booked 10 h ahead → 2 h before', 10, -2],
    ['booked 3 h ahead → 2 h before (1 h after booking)', 3, -2],
    ['booked 2.5 h ahead → none (would repeat the confirmation)', 2.5, null],
  ])('reminder: %s', (_label, hoursAhead, offset) => {
    const start = new Date(NOW.getTime() + hoursAhead * HOUR);
    const at = reminderTime(start, NOW);
    if (offset === null) expect(at).toBeNull();
    else expect(at!.getTime()).toBe(start.getTime() + offset * HOUR);
  });
});

describe('calendar helpers', () => {
  it('localDate uses the provider zone, also around midnight and the DST change', () => {
    // 22.30 UTC on 5 Oct is already 6 Oct 01.30 in Tallinn.
    expect(localDate(new Date('2026-10-05T22:30:00Z'), 'Europe/Tallinn')).toBe('2026-10-06');
    expect(localDate(new Date('2026-10-05T22:30:00Z'), 'UTC')).toBe('2026-10-05');
    // DST ends on 25 Oct 2026 at 04.00 local: 23.30 UTC on 25 Oct is 01.30 on 26 Oct (UTC+2).
    expect(localDate(new Date('2026-10-25T23:30:00Z'), 'Europe/Tallinn')).toBe('2026-10-26');
  });

  it('addDays crosses months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-10-05', 0)).toBe('2026-10-05');
  });

  it('exclusion violations are recognised (and are not unique violations)', () => {
    const wrapped = Object.assign(new Error('query failed'), { cause: exclusionViolation });
    expect(isExclusionViolation(wrapped, 'bookings_no_overlap')).toBe(true);
    expect(isExclusionViolation(wrapped, 'other')).toBe(false);
    expect(isUniqueViolation(wrapped)).toBe(false);
    expect(isExclusionViolation(new Error('nope'))).toBe(false);
    expect(isExclusionViolation(null)).toBe(false);
  });
});

/* ---------- contracts ---------- */

describe('M6 schemas', () => {
  const valid = { serviceId: SERVICE_ID, startsAt: SLOT_START.toISOString(), dogIds: [DOG_ID] };

  it('booking input: trims the note, empty → null', () => {
    expect(bookingInputSchema.parse({ ...valid, note: '  arg  ' }).note).toBe('arg');
    expect(bookingInputSchema.parse({ ...valid, note: '' }).note).toBeNull();
    expect(bookingInputSchema.parse(valid).note).toBeNull();
  });

  it.each([
    ['unknown field', { ...valid, status: 'confirmed' }],
    ['no dogs', { ...valid, dogIds: [] }],
    ['too many dogs', { ...valid, dogIds: [DOG_ID, PROVIDER_ID, SERVICE_ID, BOOKING_ID] }],
    ['duplicate dog', { ...valid, dogIds: [DOG_ID, DOG_ID] }],
    ['start without offset', { ...valid, startsAt: '2026-10-06T10:00:00' }],
    ['start as number', { ...valid, startsAt: 1 }],
    ['note too long', { ...valid, note: 'x'.repeat(301) }],
    ['null service', { ...valid, serviceId: null }],
  ])('booking input rejects %s', (_label, input) => {
    expect(bookingInputSchema.safeParse(input).success).toBe(false);
  });

  it('providers query: lat and lng come together; radius is capped', () => {
    expect(providersQuerySchema.safeParse({ lat: '59.4' }).success).toBe(false);
    expect(providersQuerySchema.safeParse({ lat: '59.4', lng: '24.7' }).success).toBe(true);
    expect(providersQuerySchema.safeParse({ radiusKm: '51' }).success).toBe(false);
    expect(providersQuerySchema.parse({}).radiusKm).toBe(25);
  });

  it('slots query: calendar date and 1–14 days', () => {
    expect(slotsQuerySchema.parse({}).days).toBe(7);
    expect(slotsQuerySchema.safeParse({ from: '2026-10-06' }).success).toBe(true);
    expect(slotsQuerySchema.safeParse({ from: '06.10.2026' }).success).toBe(false);
    expect(slotsQuerySchema.safeParse({ days: '0' }).success).toBe(false);
    expect(slotsQuerySchema.safeParse({ days: '15' }).success).toBe(false);
  });
});

/* ---------- providers service ---------- */

function providersSetup() {
  const repository = mockProvidersRepository();
  const storage = { createDownloadUrl: vi.fn(async (key: string) => `https://storage.test/${key}?signed`) };
  const service = createProvidersService({ repository, storage, timeoutMs: TIMEOUT_MS, now: () => NOW });
  return { repository, storage, service };
}

describe('ProvidersService', () => {
  it('lists by distance when a location is given, rounding to one decimal and signing photos', async () => {
    const { repository, storage, service } = providersSetup();
    repository.list.mockResolvedValue([providerRecord({ distanceKm: 1.2345, photoKey: 'providers/a.webp' })]);
    const [first] = await service.list({ lat: 59.43, lng: 24.75, radiusKm: 10, category: 'grooming' });
    expect(repository.list).toHaveBeenCalledWith({ category: 'grooming', origin: { lat: 59.43, lng: 24.75 }, radiusKm: 10 }, 50);
    expect(first).toMatchObject({ distanceKm: 1.2, photoUrl: 'https://storage.test/providers/a.webp?signed' });
    expect(first).not.toHaveProperty('photoKey');
    expect(storage.createDownloadUrl).toHaveBeenCalledWith('providers/a.webp', expect.any(Number));
  });

  it('lists without origin (by name) and without distance', async () => {
    const { repository, service } = providersSetup();
    repository.list.mockResolvedValue([providerRecord()]);
    const [first] = await service.list({ radiusKm: 25 });
    expect(repository.list).toHaveBeenCalledWith({ category: undefined, origin: undefined, radiusKm: 25 }, 50);
    expect(first).not.toHaveProperty('distanceKm');
    expect(first!.photoUrl).toBeNull();
  });

  it('an empty list is fine', async () => {
    const { repository, service } = providersSetup();
    repository.list.mockResolvedValue([]);
    expect(await service.list({ radiusKm: 25 })).toEqual([]);
  });

  it('provider detail with services; unknown id → 404', async () => {
    const { repository, service } = providersSetup();
    const detail: ProviderDetailRecord = { ...providerRecord(), description: 'd', address: 'a', timeZone: 'Europe/Tallinn', services: [] };
    repository.findById.mockResolvedValueOnce(detail).mockResolvedValueOnce(null);
    expect(await service.getProvider(PROVIDER_ID)).toMatchObject({ name: 'Käpakoda', timeZone: 'Europe/Tallinn', services: [] });
    await expect(service.getProvider(PROVIDER_ID)).rejects.toMatchObject({ statusCode: 404, key: 'errors.providerNotFound' });
  });

  it('a failing photo signature is a storage outage (503), not a 500', async () => {
    const { repository, storage, service } = providersSetup();
    repository.list.mockResolvedValue([providerRecord({ photoKey: 'k' })]);
    storage.createDownloadUrl.mockRejectedValue(new Error('S3 down'));
    await expect(service.list({ radiusKm: 25 })).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('slots: unknown service → 404 without querying slots', async () => {
    const { repository, service } = providersSetup();
    repository.findService.mockResolvedValue(null);
    await expect(service.listSlots(SERVICE_ID, { days: 7 })).rejects.toMatchObject({ statusCode: 404, key: 'errors.serviceNotFound' });
    expect(repository.findFreeSlots).not.toHaveBeenCalled();
  });

  it('slots: from defaults to today in the provider zone; every day listed, empty ones too', async () => {
    const { repository, service } = providersSetup();
    repository.findService.mockResolvedValue(bookableService());
    repository.findFreeSlots.mockResolvedValue([
      { day: '2026-10-06', startsAt: SLOT_START, endsAt: SLOT_END },
      { day: '2026-10-06', startsAt: new Date('2026-10-06T07:30:00Z'), endsAt: new Date('2026-10-06T08:30:00Z') },
    ]);
    const result = await service.listSlots(SERVICE_ID, { days: 3 });
    expect(repository.findFreeSlots).toHaveBeenCalledWith({
      serviceId: SERVICE_ID,
      from: '2026-10-05',
      days: 3,
      stepMinutes: 30,
      notBefore: new Date(NOW.getTime() + 2 * HOUR),
      notAfter: new Date(NOW.getTime() + 60 * 24 * HOUR),
    });
    expect(result.timeZone).toBe('Europe/Tallinn');
    expect(result.days.map((d) => [d.date, d.slots.length])).toEqual([
      ['2026-10-05', 0],
      ['2026-10-06', 2],
      ['2026-10-07', 0],
    ]);
    expect(result.days[1]!.slots[0]).toEqual({ startsAt: SLOT_START.toISOString(), endsAt: SLOT_END.toISOString() });
  });

  it('slots: an explicit from is used as given', async () => {
    const { repository, service } = providersSetup();
    repository.findService.mockResolvedValue(bookableService());
    repository.findFreeSlots.mockResolvedValue([]);
    const result = await service.listSlots(SERVICE_ID, { from: '2026-10-30', days: 3 });
    expect(result.days.map((d) => d.date)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('a hanging repository becomes a TimeoutError (→ 503)', async () => {
    vi.useFakeTimers();
    const { repository, service } = providersSetup();
    repository.list.mockReturnValue(new Promise(() => {}));
    const assertion = expect(service.list({ radiusKm: 25 })).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    await assertion;
  });
});

/* ---------- bookings service ---------- */

const mockNotifier = () => ({ notify: vi.fn().mockResolvedValue(undefined) }) satisfies Notifier;

function bookingsSetup(now = NOW) {
  const bookings = mockBookingsRepository();
  const providers = mockProvidersRepository();
  const dogs = mockDogsRepository();
  const notifier = mockNotifier();
  const reminders = { schedule: vi.fn().mockResolvedValue(undefined), cancel: vi.fn().mockResolvedValue(undefined) };
  const log = { warn: vi.fn() };
  const service = createBookingsService({ bookings, providers, dogs, notifier, reminders, log, timeoutMs: TIMEOUT_MS, now: () => now });
  providers.findService.mockResolvedValue(bookableService());
  dogs.ownedIds.mockResolvedValue([DOG_ID]);
  providers.findFreeSlots.mockResolvedValue([{ day: '2026-10-06', startsAt: SLOT_START, endsAt: SLOT_END }]);
  bookings.create.mockResolvedValue(bookingRecord());
  return { bookings, providers, dogs, notifier, reminders, log, service };
}

const input = (overrides: Partial<{ serviceId: string; startsAt: string; dogIds: string[]; note: string | null }> = {}) => ({
  serviceId: SERVICE_ID,
  startsAt: SLOT_START.toISOString(),
  dogIds: [DOG_ID],
  note: null,
  ...overrides,
});

describe('BookingsService.create', () => {
  it('books an offered slot with the price snapshot, records it in the feed (no push) and schedules a reminder', async () => {
    const { bookings, providers, notifier, reminders, service } = bookingsSetup();
    const booking = await service.create(USER_ID, input({ note: 'Arg' }));

    expect(providers.findFreeSlots).toHaveBeenCalledWith(expect.objectContaining({ serviceId: SERVICE_ID, from: '2026-10-06', days: 1 }));
    expect(bookings.create).toHaveBeenCalledWith({
      userId: USER_ID,
      providerId: PROVIDER_ID,
      serviceId: SERVICE_ID,
      startsAt: SLOT_START,
      endsAt: SLOT_END,
      note: 'Arg',
      priceCents: 3500,
      priceIsFrom: true,
      dogIds: [DOG_ID],
    });
    expect(booking).toMatchObject({ id: BOOKING_ID, status: 'confirmed', cancellable: true, cancelUntil: '2026-10-06T05:00:00.000Z', timeZone: 'Europe/Tallinn' });
    expect(notifier.notify).toHaveBeenCalledWith({
      type: 'booking_confirmed',
      recipientId: USER_ID,
      actorId: null,
      push: false,
      data: expect.objectContaining({ bookingId: BOOKING_ID, providerName: 'Käpakoda', serviceName: 'Pesu ja kammimine' }),
    });
    // 21 h ahead → the 24 h reminder has passed, so 2 h before.
    expect(reminders.schedule).toHaveBeenCalledWith(BOOKING_ID, new Date(SLOT_START.getTime() - 2 * HOUR));
  });

  it('unknown service → 404, nothing else is checked', async () => {
    const { providers, dogs, bookings, service } = bookingsSetup();
    providers.findService.mockResolvedValue(null);
    await expect(service.create(USER_ID, input())).rejects.toMatchObject({ statusCode: 404, key: 'errors.serviceNotFound' });
    expect(dogs.ownedIds).not.toHaveBeenCalled();
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it('someone else’s (or a missing) dog → 404, not 403', async () => {
    const { dogs, bookings, service } = bookingsSetup();
    dogs.ownedIds.mockResolvedValue([]);
    await expect(service.create(USER_ID, input())).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.create(USER_ID, input())).rejects.toMatchObject({ key: 'errors.dogNotFound' });
    expect(dogs.ownedIds).toHaveBeenCalledWith(USER_ID, [DOG_ID]);
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it.each([
    ['in the past', new Date(NOW.getTime() - HOUR)],
    ['inside the 2 h cutoff', new Date(NOW.getTime() + HOUR)],
    ['beyond the 60-day horizon', new Date(NOW.getTime() + 61 * 24 * HOUR)],
  ])('a start %s → 409 without asking the database for slots', async (_label, start) => {
    const { providers, bookings, service } = bookingsSetup();
    await expect(service.create(USER_ID, input({ startsAt: start.toISOString() }))).rejects.toMatchObject({
      statusCode: 409,
      key: 'errors.slotUnavailable',
    });
    expect(providers.findFreeSlots).not.toHaveBeenCalled();
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it('a time that is not offered (off-grid, closed or taken) → 409', async () => {
    const { bookings, service } = bookingsSetup();
    await expect(service.create(USER_ID, input({ startsAt: '2026-10-06T07:10:00.000Z' }))).rejects.toMatchObject({ key: 'errors.slotUnavailable' });
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it('the same instant written with another offset is the same slot', async () => {
    const { bookings, service } = bookingsSetup();
    await service.create(USER_ID, input({ startsAt: '2026-10-06T10:00:00+03:00' }));
    expect(bookings.create).toHaveBeenCalledWith(expect.objectContaining({ startsAt: SLOT_START }));
  });

  it('losing the race to a concurrent booking (exclusion violation) → 409 slotTaken, no notification', async () => {
    const { bookings, notifier, reminders, service } = bookingsSetup();
    bookings.create.mockRejectedValue(Object.assign(new Error('insert failed'), { cause: exclusionViolation }));
    await expect(service.create(USER_ID, input())).rejects.toBeInstanceOf(ConflictError);
    await expect(service.create(USER_ID, input())).rejects.toMatchObject({ key: 'errors.slotTaken' });
    expect(notifier.notify).not.toHaveBeenCalled();
    expect(reminders.schedule).not.toHaveBeenCalled();
  });

  it('other database errors are not disguised as conflicts', async () => {
    const { bookings, service } = bookingsSetup();
    const boom = new Error('connection reset');
    bookings.create.mockRejectedValue(boom);
    await expect(service.create(USER_ID, input())).rejects.toBe(boom);
  });

  it('a failing reminder queue does not fail the booking (logged)', async () => {
    const { reminders, log, service } = bookingsSetup();
    reminders.schedule.mockRejectedValue(new Error('Redis down'));
    await expect(service.create(USER_ID, input())).resolves.toMatchObject({ id: BOOKING_ID });
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ bookingId: BOOKING_ID }), 'reminders.schedule failed');
  });

  it('a hanging reminder queue gives up after 2 s and the booking still succeeds', async () => {
    vi.useFakeTimers();
    const { reminders, log, service } = bookingsSetup();
    reminders.schedule.mockReturnValue(new Promise(() => {}));
    const result = service.create(USER_ID, input());
    await vi.advanceTimersByTimeAsync(REMINDER_SCHEDULE_TIMEOUT_MS);
    await expect(result).resolves.toMatchObject({ id: BOOKING_ID });
    expect(log.warn).toHaveBeenCalled();
  });

  it('no reminder when the booking is too soon for one', async () => {
    const soon = new Date(NOW.getTime() + 2.5 * HOUR);
    const { providers, bookings, reminders, service } = bookingsSetup();
    providers.findFreeSlots.mockResolvedValue([{ day: '2026-10-05', startsAt: soon, endsAt: new Date(soon.getTime() + HOUR) }]);
    bookings.create.mockResolvedValue(bookingRecord({ startsAt: soon, endsAt: new Date(soon.getTime() + HOUR) }));
    await service.create(USER_ID, input({ startsAt: soon.toISOString() }));
    expect(reminders.schedule).not.toHaveBeenCalled();
  });

  it('a hanging database becomes a TimeoutError (→ 503)', async () => {
    vi.useFakeTimers();
    const { providers, service } = bookingsSetup();
    providers.findService.mockReturnValue(new Promise(() => {}));
    const assertion = expect(service.create(USER_ID, input())).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    await assertion;
  });
});

describe('BookingsService list / get / cancel / reminder', () => {
  it('lists upcoming or past from the matching query', async () => {
    const { bookings, service } = bookingsSetup();
    bookings.listUpcoming.mockResolvedValue([bookingRecord()]);
    bookings.listPast.mockResolvedValue([]);
    expect(await service.list(USER_ID, { scope: 'upcoming' })).toHaveLength(1);
    expect(await service.list(USER_ID, { scope: 'past' })).toEqual([]);
    expect(bookings.listUpcoming).toHaveBeenCalledWith(USER_ID, 50);
    expect(bookings.listPast).toHaveBeenCalledWith(USER_ID, 50);
  });

  it('an ended confirmed booking reads as completed and is not cancellable', async () => {
    const later = new Date(SLOT_END.getTime() + HOUR);
    const { bookings, service } = bookingsSetup(later);
    bookings.findOwn.mockResolvedValue(bookingRecord());
    expect(await service.get(USER_ID, BOOKING_ID)).toMatchObject({ status: 'completed', cancellable: false });
  });

  it('get: someone else’s booking is 404', async () => {
    const { bookings, service } = bookingsSetup();
    bookings.findOwn.mockResolvedValue(null);
    await expect(service.get(USER_ID, BOOKING_ID)).rejects.toMatchObject({ statusCode: 404, key: 'errors.bookingNotFound' });
    expect(bookings.findOwn).toHaveBeenCalledWith(USER_ID, BOOKING_ID);
  });

  it('cancel: notifies once (feed, no push) and removes the reminder', async () => {
    const { bookings, notifier, reminders, service } = bookingsSetup();
    const cancelled = bookingRecord({ status: 'cancelled', cancelledAt: NOW });
    bookings.findOwn.mockResolvedValueOnce(bookingRecord()).mockResolvedValueOnce(cancelled);
    bookings.cancel.mockResolvedValue(true);
    const result = await service.cancel(USER_ID, BOOKING_ID);
    expect(result).toMatchObject({ status: 'cancelled', cancellable: false, cancelledAt: NOW.toISOString() });
    expect(notifier.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'booking_cancelled', push: false, actorId: null }));
    expect(reminders.cancel).toHaveBeenCalledWith(BOOKING_ID);
  });

  it('cancel is idempotent: an already cancelled booking is returned as is, quietly', async () => {
    const { bookings, notifier, service } = bookingsSetup();
    bookings.findOwn.mockResolvedValue(bookingRecord({ status: 'cancelled', cancelledAt: NOW }));
    expect(await service.cancel(USER_ID, BOOKING_ID)).toMatchObject({ status: 'cancelled' });
    expect(bookings.cancel).not.toHaveBeenCalled();
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('cancel losing a parallel double tap does not notify twice', async () => {
    const { bookings, notifier, service } = bookingsSetup();
    bookings.findOwn.mockResolvedValueOnce(bookingRecord()).mockResolvedValueOnce(bookingRecord({ status: 'cancelled', cancelledAt: NOW }));
    bookings.cancel.mockResolvedValue(false);
    expect(await service.cancel(USER_ID, BOOKING_ID)).toMatchObject({ status: 'cancelled' });
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('cancel after the cutoff → 409 with the hours in the message', async () => {
    const insideCutoff = new Date(SLOT_START.getTime() - HOUR);
    const { bookings, service } = bookingsSetup(insideCutoff);
    bookings.findOwn.mockResolvedValue(bookingRecord());
    await expect(service.cancel(USER_ID, BOOKING_ID)).rejects.toMatchObject({ statusCode: 409, key: 'errors.cancelTooLate', params: { hours: 2 } });
    expect(bookings.cancel).not.toHaveBeenCalled();
  });

  it('cancel exactly at the cutoff is still allowed', async () => {
    const { bookings, service } = bookingsSetup(cancelUntil(SLOT_START));
    bookings.findOwn.mockResolvedValue(bookingRecord());
    bookings.cancel.mockResolvedValue(true);
    await expect(service.cancel(USER_ID, BOOKING_ID)).resolves.toBeDefined();
  });

  it('cancel: foreign or missing booking → 404', async () => {
    const { bookings, service } = bookingsSetup();
    bookings.findOwn.mockResolvedValue(null);
    await expect(service.cancel(USER_ID, BOOKING_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('reminder: sent (with push) for a confirmed future booking', async () => {
    const { bookings, notifier, service } = bookingsSetup();
    bookings.findById.mockResolvedValue(bookingRecord());
    await service.sendReminder(BOOKING_ID);
    expect(notifier.notify).toHaveBeenCalledWith({
      type: 'booking_reminder',
      recipientId: USER_ID,
      actorId: null,
      data: expect.objectContaining({ bookingId: BOOKING_ID, startsAt: SLOT_START.toISOString() }),
    });
  });

  it.each([
    ['missing', null],
    ['cancelled', bookingRecord({ status: 'cancelled', cancelledAt: NOW })],
    ['already started', bookingRecord({ startsAt: new Date(NOW.getTime() - 60_000) })],
  ])('reminder: skipped when the booking is %s', async (_label, record) => {
    const { bookings, notifier, service } = bookingsSetup();
    bookings.findById.mockResolvedValue(record);
    await service.sendReminder(BOOKING_ID);
    expect(notifier.notify).not.toHaveBeenCalled();
  });
});

/* ---------- notifier & push texts ---------- */

describe('Notifier for bookings', () => {
  function notifierSetup(bookingsOn = true) {
    const notifications = mockNotificationsRepository();
    notifications.create.mockResolvedValue({ id: BOOKING_ID, type: 'booking_reminder', actor: null, data: {}, readAt: null, createdAt: NOW.toISOString() });
    notifications.unreadCount.mockResolvedValue(1);
    notifications.pushContext.mockResolvedValue({
      language: 'ru',
      preferences: { messages: true, friendRequests: true, friendPlans: true, bookings: bookingsOn },
    });
    const realtime = { emitToUsers: vi.fn() };
    const pushQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const notifier = createNotifier({ notifications, realtime, pushQueue, log: { warn: vi.fn() }, timeoutMs: TIMEOUT_MS });
    return { notifications, realtime, pushQueue, notifier };
  }
  const data = { bookingId: BOOKING_ID, providerName: 'Käpakoda', serviceName: 'Pesu', startsAt: SLOT_START.toISOString() };

  it('push: false writes the feed row and realtime event but never reads preferences or enqueues', async () => {
    const { notifications, realtime, pushQueue, notifier } = notifierSetup();
    await notifier.notify({ type: 'booking_confirmed', recipientId: USER_ID, actorId: null, data, push: false });
    expect(notifications.create).toHaveBeenCalledWith({ userId: USER_ID, type: 'booking_confirmed', actorId: null, data });
    expect(realtime.emitToUsers).toHaveBeenCalledWith([USER_ID], 'notification:new', expect.anything());
    expect(notifications.pushContext).not.toHaveBeenCalled();
    expect(pushQueue.enqueue).not.toHaveBeenCalled();
  });

  it('a reminder is pushed in the recipient’s language with the booking id for the tap', async () => {
    const { pushQueue, notifier } = notifierSetup();
    await notifier.notify({ type: 'booking_reminder', recipientId: USER_ID, actorId: null, data });
    expect(pushQueue.enqueue).toHaveBeenCalledWith({
      userId: USER_ID,
      language: 'ru',
      title: 'Скоро увидимся!',
      body: `Pesu · Käpakoda · ${formatBookingStart('ru', SLOT_START.toISOString())}`,
      data: { type: 'booking_reminder', notificationId: BOOKING_ID, bookingId: BOOKING_ID },
    });
  });

  it('the bookings preference off stops the push', async () => {
    const { pushQueue, notifier } = notifierSetup(false);
    await notifier.notify({ type: 'booking_reminder', recipientId: USER_ID, actorId: null, data });
    expect(pushQueue.enqueue).not.toHaveBeenCalled();
  });

  it('booking texts in three languages, start in Tallinn time', () => {
    expect(formatBookingStart('et', SLOT_START.toISOString())).toMatch(/10\.00$/);
    expect(formatBookingStart('en', SLOT_START.toISOString())).toMatch(/10:00$/);
    expect(composePush('et', 'booking_reminder', '', data)).toEqual({
      title: 'Kohtumiseni varsti!',
      body: `Pesu · Käpakoda · ${formatBookingStart('et', SLOT_START.toISOString())}`,
    });
    expect(composePush('en', 'booking_confirmed', '', data).title).toBe('Booking confirmed');
    expect(composePush('ru', 'booking_cancelled', '', data).title).toBe('Запись отменена');
    // Missing data never prints "undefined".
    expect(composePush('et', 'booking_reminder', '', {}).body).toBe(' ·  · ');
  });
});
