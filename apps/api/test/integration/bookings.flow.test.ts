/**
 * M6 end to end with real auth, PostgreSQL/PostGIS and (for reminders) BullMQ in Redis:
 * catalogue by category and distance → provider detail → free slots in Tallinn time → booking with
 * own dogs only → the slot disappears → overlapping times are refused → concurrent double booking
 * lets exactly one through (exclusion constraint) → feed rows → cancel (idempotent, cutoff) frees the
 * time → reminder job fires through the worker and becomes a push in the user's language.
 * Providers are created near Haapsalu so the dev seed (Tallinn) cannot interfere with distances.
 */
import type { Booking, ServiceSlots } from '@kapp/shared';
import { eq, inArray, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { env } from '../../src/config/env';
import { db, pool } from '../../src/db/client';
import { bookingDogs, bookings, dogs, notificationPreferences, providerHours, serviceProviders, services, user } from '../../src/db/schema';
import { localDate } from '../../src/lib/calendar';
import { createBookingReminderQueue, startBookingReminderWorker } from '../../src/modules/bookings/booking-reminders';
import type { PushJob } from '../../src/modules/notifications/push-queue';
import { createServices } from '../../src/services';
import { buildRealApp, signUpAndGetCookie, testStorage } from './real-app';

const DOMAIN = '@bookings-flow.test.invalid';
const RUN = Date.now();
const TZ = 'Europe/Tallinn';
const HOUR = 3_600_000;

/** Reminders captured instead of queued, so the HTTP flow can assert what was scheduled. */
const scheduled: { bookingId: string; at: Date }[] = [];
const cancelledReminders: string[] = [];
const reminders = {
  schedule: async (bookingId: string, at: Date) => void scheduled.push({ bookingId, at }),
  cancel: async (bookingId: string) => void cancelledReminders.push(bookingId),
};
const pushes: PushJob[] = [];
const pushQueue = { enqueue: async (job: PushJob) => void pushes.push(job) };

let app: Awaited<ReturnType<typeof buildRealApp>>;
const people = { kristi: { cookie: '', id: '', dogId: '' }, mart: { cookie: '', id: '', dogId: '' } };
type Who = keyof typeof people;
const ids = { groomer: '', wash: '', nails: '', trainer: '', lesson: '', other: '', otherService: '' };

const api = (who: Who, method: 'GET' | 'POST', url: string, payload?: object, headers: Record<string, string> = {}) =>
  app.inject({ method, url: `/api/v1${url}`, headers: { cookie: people[who].cookie, ...headers }, payload });

const tallinnHour = (iso: string) => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: TZ }).format(new Date(iso)));

async function slots(serviceId: string, days = 3): Promise<ServiceSlots> {
  const res = await api('kristi', 'GET', `/services/${serviceId}/slots?days=${days}`);
  expect(res.statusCode).toBe(200);
  return res.json();
}

/** First free slot tomorrow (Tallinn): always after the 2 h cutoff, whatever time the test runs. */
async function tomorrowSlots(serviceId: string) {
  const { days } = await slots(serviceId);
  const tomorrow = days[1]!;
  expect(tomorrow.slots.length).toBeGreaterThan(0);
  return tomorrow.slots;
}

beforeAll(async () => {
  app = await buildRealApp(undefined, { bookingReminders: reminders, pushQueue });
  for (const who of Object.keys(people) as Who[]) {
    people[who].cookie = await signUpAndGetCookie(app, `${who}-${RUN}${DOMAIN}`);
    people[who].id = (await api(who, 'GET', '/me')).json().id;
    const dog = await api(who, 'POST', '/me/dogs', { name: who === 'kristi' ? 'Freddy' : 'Muki' });
    people[who].dogId = dog.json().id;
  }
  await db.update(user).set({ language: 'en' }).where(eq(user.id, people.kristi.id));

  const created = await db
    .insert(serviceProviders)
    .values([
      { name: `IT Haapsalu Groomer ${RUN}`, category: 'grooming', area: 'Haapsalu', location: { x: 23.54, y: 58.94 } },
      { name: `IT Haapsalu Trainer ${RUN}`, category: 'training', area: 'Haapsalu', location: { x: 23.56, y: 58.95 } },
      // Far away (Narva): outside any radius used below.
      { name: `IT Narva Groomer ${RUN}`, category: 'grooming', area: 'Narva', location: { x: 28.19, y: 59.38 } },
    ])
    .returning({ id: serviceProviders.id, name: serviceProviders.name });
  ids.groomer = created.find((p) => p.name.includes('Haapsalu Groomer'))!.id;
  ids.trainer = created.find((p) => p.name.includes('Trainer'))!.id;
  ids.other = created.find((p) => p.name.includes('Narva'))!.id;

  // Open every day 08.00–20.00 local time, so "tomorrow" always has slots.
  const everyDay = (providerId: string) => [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ providerId, weekday, opensAt: '08:00', closesAt: '20:00' }));
  await db.insert(providerHours).values([...everyDay(ids.groomer), ...everyDay(ids.trainer), ...everyDay(ids.other)]);
  const svc = await db
    .insert(services)
    .values([
      { providerId: ids.groomer, name: 'Wash', durationMinutes: 60, priceCents: 3500, priceIsFrom: true },
      { providerId: ids.groomer, name: 'Nails', durationMinutes: 15, priceCents: 1200 },
      { providerId: ids.trainer, name: 'Lesson', durationMinutes: 45, priceCents: 3000 },
      { providerId: ids.other, name: 'Far wash', durationMinutes: 60, priceCents: 2000 },
    ])
    .returning({ id: services.id, name: services.name });
  ids.wash = svc.find((s) => s.name === 'Wash')!.id;
  ids.nails = svc.find((s) => s.name === 'Nails')!.id;
  ids.lesson = svc.find((s) => s.name === 'Lesson')!.id;
  ids.otherService = svc.find((s) => s.name === 'Far wash')!.id;
});

afterAll(async () => {
  const providerIds = [ids.groomer, ids.trainer, ids.other].filter(Boolean);
  if (providerIds.length > 0) {
    // bookings → services is `restrict`, so bookings go first.
    await db.delete(bookings).where(inArray(bookings.providerId, providerIds));
    await db.delete(serviceProviders).where(inArray(serviceProviders.id, providerIds));
  }
  await db.delete(user).where(like(user.email, `%${DOMAIN}`));
  await app.close();
  await pool.end();
});

describe('catalogue', () => {
  it('lists by category near a point, nearest first, with the cheapest price', async () => {
    const res = await api('kristi', 'GET', '/service-providers?lat=58.94&lng=23.54&radiusKm=10');
    expect(res.statusCode).toBe(200);
    const list = res.json() as { id: string; distanceKm: number; priceFromCents: number }[];
    expect(list.map((p) => p.id)).toEqual([ids.groomer, ids.trainer]);
    expect(list[0]).toMatchObject({ distanceKm: 0, priceFromCents: 1200 });
    expect(list[1]!.distanceKm).toBeGreaterThan(0);

    const groomers = (await api('kristi', 'GET', '/service-providers?category=grooming&lat=58.94&lng=23.54&radiusKm=10')).json();
    expect(groomers.map((p: { id: string }) => p.id)).toEqual([ids.groomer]);
  });

  it('without a location the list is alphabetical and includes far providers', async () => {
    const list = (await api('kristi', 'GET', '/service-providers?category=grooming')).json() as { id: string; name: string }[];
    expect(list.map((p) => p.id)).toEqual(expect.arrayContaining([ids.groomer, ids.other]));
    expect(list.find((p) => p.id === ids.groomer)).not.toHaveProperty('distanceKm');
    const names = list.map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
  });

  it('provider detail lists services cheapest first; unknown id is 404', async () => {
    const res = await api('kristi', 'GET', `/service-providers/${ids.groomer}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ timeZone: TZ, area: 'Haapsalu', services: [{ name: 'Nails', priceCents: 1200 }, { name: 'Wash', priceIsFrom: true }] });
    expect((await api('kristi', 'GET', '/service-providers/00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
  });

  it('slots are in Tallinn wall-clock time on a 30-minute grid, never in the past or within 2 h', async () => {
    const { days, timeZone } = await slots(ids.wash, 3);
    expect(timeZone).toBe(TZ);
    expect(days.map((d) => d.date)[0]).toBe(localDate(new Date(), TZ));
    const tomorrow = days[1]!.slots;
    // 08.00 … 19.00 (a 60-minute service must end by 20.00) = 23 starts.
    expect(tomorrow).toHaveLength(23);
    expect(tallinnHour(tomorrow[0]!.startsAt)).toBe(8);
    expect(tallinnHour(tomorrow.at(-1)!.startsAt)).toBe(19);
    expect(new Date(tomorrow[1]!.startsAt).getTime() - new Date(tomorrow[0]!.startsAt).getTime()).toBe(30 * 60_000);
    for (const slot of days.flatMap((d) => d.slots)) {
      expect(new Date(slot.startsAt).getTime()).toBeGreaterThanOrEqual(Date.now() + 2 * HOUR - 60_000);
    }
  });
});

describe('booking', () => {
  let first: Booking;

  it('refuses someone else’s dog (404) and an off-grid time (409)', async () => {
    const [slot] = await tomorrowSlots(ids.wash);
    const foreign = await api('kristi', 'POST', '/me/bookings', { serviceId: ids.wash, startsAt: slot!.startsAt, dogIds: [people.mart.dogId] });
    expect(foreign.statusCode).toBe(404);
    const offGrid = new Date(new Date(slot!.startsAt).getTime() + 10 * 60_000).toISOString();
    const res = await api('kristi', 'POST', '/me/bookings', { serviceId: ids.wash, startsAt: offGrid, dogIds: [people.kristi.dogId] });
    expect(res.statusCode).toBe(409);
  });

  it('refuses a time in the past', async () => {
    const res = await api('kristi', 'POST', '/me/bookings', {
      serviceId: ids.wash,
      startsAt: new Date(Date.now() - HOUR).toISOString(),
      dogIds: [people.kristi.dogId],
    });
    expect(res.statusCode).toBe(409);
  });

  it('books a free slot (price snapshot, note) and schedules a reminder', async () => {
    const [slot] = await tomorrowSlots(ids.wash);
    const res = await api('kristi', 'POST', '/me/bookings', {
      serviceId: ids.wash,
      startsAt: slot!.startsAt,
      dogIds: [people.kristi.dogId],
      note: '  Esimene külastus, alguses veidi arg.  ',
    });
    expect(res.statusCode).toBe(201);
    first = res.json();
    expect(first).toMatchObject({
      status: 'confirmed',
      startsAt: slot!.startsAt,
      endsAt: slot!.endsAt,
      note: 'Esimene külastus, alguses veidi arg.',
      priceCents: 3500,
      priceIsFrom: true,
      cancellable: true,
      dogs: [{ id: people.kristi.dogId, name: 'Freddy' }],
      service: { id: ids.wash, durationMinutes: 60 },
    });
    expect(scheduled.find((s) => s.bookingId === first.id)).toBeDefined();
  });

  it('the slot and every overlapping start disappear, also for other services of the provider', async () => {
    const start = new Date(first.startsAt).getTime();
    const washStarts = (await tomorrowSlots(ids.wash)).map((s) => new Date(s.startsAt).getTime());
    // 60-min wash: starts from 30 min before to 30 min after the booking overlap it.
    for (const offset of [-30, 0, 30]) expect(washStarts).not.toContain(start + offset * 60_000);
    const nailStarts = (await tomorrowSlots(ids.nails)).map((s) => new Date(s.startsAt).getTime());
    expect(nailStarts).not.toContain(start + 30 * 60_000);
    // Back to back is fine: the booking ends exactly when this one starts.
    expect(nailStarts).toContain(start + 60 * 60_000);
    // Another provider is not affected.
    expect((await tomorrowSlots(ids.lesson)).map((s) => s.startsAt)).toContain(first.startsAt);
  });

  it('a taken time is refused with 409 for another user', async () => {
    const res = await api('mart', 'POST', '/me/bookings', { serviceId: ids.nails, startsAt: first.startsAt, dogIds: [people.mart.dogId] });
    expect(res.statusCode).toBe(409);
  });

  it('concurrent requests for the same free slot: exactly one booking is created', async () => {
    const free = await tomorrowSlots(ids.lesson);
    const target = free[free.length - 1]!.startsAt;
    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const who: Who = i % 2 === 0 ? 'kristi' : 'mart';
        return api(who, 'POST', '/me/bookings', { serviceId: ids.lesson, startsAt: target, dogIds: [people[who].dogId] });
      }),
    );
    const codes = attempts.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 409, 409, 409, 409, 409]);
    for (const r of attempts.filter((a) => a.statusCode === 409)) expect(r.json().message).toMatch(/aeg/);
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(sql`${bookings.providerId} = ${ids.trainer} and ${bookings.startsAt} = ${target}::timestamptz and ${bookings.status} <> 'cancelled'`);
    expect(row!.count).toBe(1);
  });

  it('the database itself refuses overlaps (23P01) and a service of another provider (FK), and allows back to back', async () => {
    const start = new Date(first.startsAt);
    const base = { userId: people.mart.id, providerId: ids.groomer, serviceId: ids.nails, priceCents: 1200, priceIsFrom: false };
    const overlap = db.insert(bookings).values({ ...base, startsAt: new Date(start.getTime() + 15 * 60_000), endsAt: new Date(start.getTime() + 30 * 60_000) });
    await expect(overlap).rejects.toMatchObject({ cause: { code: '23P01', constraint: 'bookings_no_overlap' } });

    const mismatched = db.insert(bookings).values({ ...base, providerId: ids.trainer, startsAt: new Date(start.getTime() + 5 * HOUR), endsAt: new Date(start.getTime() + 6 * HOUR) });
    await expect(mismatched).rejects.toMatchObject({ cause: { code: '23503', constraint: 'bookings_service_provider_fk' } });

    const [backToBack] = await db
      .insert(bookings)
      .values({ ...base, startsAt: new Date(start.getTime() + HOUR), endsAt: new Date(start.getTime() + HOUR + 15 * 60_000) })
      .returning({ id: bookings.id });
    expect(backToBack).toBeDefined();
    await db.delete(bookings).where(eq(bookings.id, backToBack!.id));
  });

  it('foreign booking ids are 404 for get and cancel', async () => {
    expect((await api('mart', 'GET', `/me/bookings/${first.id}`)).statusCode).toBe(404);
    expect((await api('mart', 'POST', `/me/bookings/${first.id}/cancel`)).statusCode).toBe(404);
  });

  it('my bookings: upcoming has it, past does not; the feed has a confirmation row', async () => {
    const upcoming = (await api('kristi', 'GET', '/me/bookings')).json() as Booking[];
    expect(upcoming.map((b) => b.id)).toContain(first.id);
    const past = (await api('kristi', 'GET', '/me/bookings?scope=past')).json() as Booking[];
    expect(past.map((b) => b.id)).not.toContain(first.id);
    const feed = (await api('kristi', 'GET', '/me/notifications')).json();
    expect(feed.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'booking_confirmed', actor: null, data: expect.objectContaining({ bookingId: first.id, serviceName: 'Wash' }) })]),
    );
    // Confirmation is on screen already: no push for it.
    expect(pushes).toHaveLength(0);
  });

  it('cancel frees the time, is idempotent, moves it to past and writes a feed row', async () => {
    const res = await api('kristi', 'POST', `/me/bookings/${first.id}/cancel`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'cancelled', cancellable: false });
    const again = await api('kristi', 'POST', `/me/bookings/${first.id}/cancel`);
    expect(again.statusCode).toBe(200);
    expect(again.json().cancelledAt).toBe(res.json().cancelledAt);
    expect(cancelledReminders).toEqual([first.id]);

    expect((await tomorrowSlots(ids.wash)).map((s) => s.startsAt)).toContain(first.startsAt);
    const past = (await api('kristi', 'GET', '/me/bookings?scope=past')).json() as Booking[];
    expect(past.find((b) => b.id === first.id)?.status).toBe('cancelled');
    const feed = (await api('kristi', 'GET', '/me/notifications')).json();
    expect(feed.items.filter((n: { type: string }) => n.type === 'booking_cancelled')).toHaveLength(1);
  });

  it('cancelling inside the 2 h cutoff is refused (409, in the user’s language)', async () => {
    const soon = new Date(Date.now() + HOUR);
    const [row] = await db
      .insert(bookings)
      .values({ userId: people.kristi.id, providerId: ids.trainer, serviceId: ids.lesson, startsAt: soon, endsAt: new Date(soon.getTime() + 45 * 60_000), priceCents: 3000, priceIsFrom: false })
      .returning({ id: bookings.id });
    await db.insert(bookingDogs).values({ bookingId: row!.id, dogId: people.kristi.dogId });
    const res = await api('kristi', 'POST', `/me/bookings/${row!.id}/cancel`, undefined, { 'accept-language': 'en' });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toBe('Bookings can be cancelled up to 2 hours before the start');
    expect((await api('kristi', 'GET', `/me/bookings/${row!.id}`)).json()).toMatchObject({ status: 'confirmed', cancellable: false });
  });

  it('a finished booking reads as completed under past', async () => {
    const ended = new Date(Date.now() - 3 * HOUR);
    const [row] = await db
      .insert(bookings)
      .values({ userId: people.kristi.id, providerId: ids.trainer, serviceId: ids.lesson, startsAt: ended, endsAt: new Date(ended.getTime() + 45 * 60_000), priceCents: 3000, priceIsFrom: false })
      .returning({ id: bookings.id });
    const past = (await api('kristi', 'GET', '/me/bookings?scope=past')).json() as Booking[];
    expect(past.find((b) => b.id === row!.id)?.status).toBe('completed');
    expect(((await api('kristi', 'GET', '/me/bookings')).json() as Booking[]).map((b) => b.id)).not.toContain(row!.id);
  });

  it('deleting a dog keeps the booking (history) without that dog', async () => {
    const extra = (await api('mart', 'POST', '/me/dogs', { name: 'Ajutine' })).json();
    const [slot] = await tomorrowSlots(ids.nails);
    const created = (await api('mart', 'POST', '/me/bookings', { serviceId: ids.nails, startsAt: slot!.startsAt, dogIds: [extra.id, people.mart.dogId] })).json() as Booking;
    expect(created.dogs).toHaveLength(2);
    await db.delete(dogs).where(eq(dogs.id, extra.id));
    expect((await api('mart', 'GET', `/me/bookings/${created.id}`)).json().dogs).toEqual([{ id: people.mart.dogId, name: 'Muki' }]);
  });
});

describe('reminders', () => {
  it('a delayed BullMQ job reaches the worker, which pushes in the user’s language (and respects the preference)', async () => {
    // Real queue + worker in Redis under a throwaway prefix; the push itself is captured.
    const connection = { url: env.REDIS_URL, prefix: `kapp-test-m6-${RUN}` };
    const queue = createBookingReminderQueue(connection);
    const captured: PushJob[] = [];
    const services = createServices(db, testStorage, 5000, { pushQueue: { enqueue: async (job) => void captured.push(job) } });
    const delivered: string[] = [];
    const worker = startBookingReminderWorker(
      connection,
      async (bookingId) => {
        await services.bookingsService.sendReminder(bookingId);
        delivered.push(bookingId);
      },
      { warn: () => {} },
    );
    try {
      const [slot] = await tomorrowSlots(ids.lesson);
      const booking = (await api('kristi', 'POST', '/me/bookings', { serviceId: ids.lesson, startsAt: slot!.startsAt, dogIds: [people.kristi.dogId] })).json() as Booking;
      await queue.schedule(booking.id, new Date(Date.now() + 200));
      // Scheduling twice is a no-op (deterministic job id).
      await queue.schedule(booking.id, new Date(Date.now() + 200));
      for (let i = 0; i < 50 && delivered.length === 0; i++) await new Promise((r) => setTimeout(r, 100));
      expect(delivered).toEqual([booking.id]);
      expect(captured).toEqual([
        expect.objectContaining({
          userId: people.kristi.id,
          language: 'en',
          title: 'See you soon!',
          body: expect.stringMatching(/^Lesson · IT Haapsalu Trainer/),
          data: expect.objectContaining({ type: 'booking_reminder', bookingId: booking.id }),
        }),
      ]);

      // Preference off → feed row only.
      await db.insert(notificationPreferences).values({ userId: people.kristi.id, bookings: false });
      await services.bookingsService.sendReminder(booking.id);
      expect(captured).toHaveLength(1);

      // A cancelled booking's job is removed; even if it ran, the worker would skip it.
      await queue.schedule(booking.id, new Date(Date.now() + 60_000));
      await queue.cancel(booking.id);
      expect(await queue.queue.getJob(`reminder-${booking.id}`)).toBeUndefined();
    } finally {
      await worker.close();
      await queue.queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
