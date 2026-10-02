import type { BookingStatus, ServiceCategory } from '@kapp/shared';
import { and, asc, desc, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { bookingDogs, bookings, dogs, serviceProviders, services } from '../../db/schema';

/** A booking as stored (status not yet derived); the service applies the time rules. */
export interface BookingRecord {
  id: string;
  userId: string;
  status: BookingStatus;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
  priceCents: number;
  priceIsFrom: boolean;
  cancelledAt: Date | null;
  createdAt: Date;
  provider: { id: string; name: string; category: ServiceCategory; area: string; address: string | null; timeZone: string };
  service: { id: string; name: string; durationMinutes: number };
  dogs: { id: string; name: string }[];
}

export interface NewBooking {
  userId: string;
  providerId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
  priceCents: number;
  priceIsFrom: boolean;
  dogIds: string[];
}

export interface BookingsRepository {
  /** Booking + its dogs in one transaction. Overlaps fail with 23P01 (`bookings_no_overlap`). */
  create(input: NewBooking): Promise<BookingRecord>;
  /** Only the user's own booking; someone else's id is null like a missing one. */
  findOwn(userId: string, bookingId: string): Promise<BookingRecord | null>;
  /** For the reminder worker, which has no user. */
  findById(bookingId: string): Promise<BookingRecord | null>;
  /** Confirmed and not over yet, soonest first. */
  listUpcoming(userId: string, limit: number): Promise<BookingRecord[]>;
  /** Over or cancelled, most recent first. */
  listPast(userId: string, limit: number): Promise<BookingRecord[]>;
  /** true if this call cancelled it; false if it was not confirmed any more (already cancelled). */
  cancel(userId: string, bookingId: string): Promise<boolean>;
}

const columns = {
  id: bookings.id,
  userId: bookings.userId,
  status: bookings.status,
  startsAt: bookings.startsAt,
  endsAt: bookings.endsAt,
  note: bookings.note,
  priceCents: bookings.priceCents,
  priceIsFrom: bookings.priceIsFrom,
  cancelledAt: bookings.cancelledAt,
  createdAt: bookings.createdAt,
  providerId: serviceProviders.id,
  providerName: serviceProviders.name,
  category: serviceProviders.category,
  area: serviceProviders.area,
  address: serviceProviders.address,
  timeZone: serviceProviders.timeZone,
  serviceId: services.id,
  serviceName: services.name,
  durationMinutes: services.durationMinutes,
};

export function createBookingsRepository(db: Db): BookingsRepository {
  async function select(where: ReturnType<typeof and>, order: 'asc' | 'desc', limit: number): Promise<BookingRecord[]> {
    const rows = await db
      .select(columns)
      .from(bookings)
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .innerJoin(serviceProviders, eq(serviceProviders.id, bookings.providerId))
      .where(where)
      .orderBy(order === 'asc' ? asc(bookings.startsAt) : desc(bookings.startsAt))
      .limit(limit);
    if (rows.length === 0) return [];
    const dogRows = await db
      .select({ bookingId: bookingDogs.bookingId, id: dogs.id, name: dogs.name })
      .from(bookingDogs)
      .innerJoin(dogs, eq(dogs.id, bookingDogs.dogId))
      .where(inArray(bookingDogs.bookingId, rows.map((r) => r.id)))
      .orderBy(asc(dogs.name));
    const dogMap = new Map<string, { id: string; name: string }[]>();
    for (const { bookingId, ...dog } of dogRows) dogMap.set(bookingId, [...(dogMap.get(bookingId) ?? []), dog]);
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      status: r.status,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      note: r.note,
      priceCents: r.priceCents,
      priceIsFrom: r.priceIsFrom,
      cancelledAt: r.cancelledAt,
      createdAt: r.createdAt,
      provider: { id: r.providerId, name: r.providerName, category: r.category, area: r.area, address: r.address, timeZone: r.timeZone },
      service: { id: r.serviceId, name: r.serviceName, durationMinutes: r.durationMinutes },
      dogs: dogMap.get(r.id) ?? [],
    }));
  }

  const findOne = async (where: ReturnType<typeof and>) => (await select(where, 'asc', 1))[0] ?? null;

  return {
    async create({ dogIds, ...input }) {
      const id = await db.transaction(async (tx) => {
        const [row] = await tx.insert(bookings).values({ ...input, status: 'confirmed' }).returning({ id: bookings.id });
        await tx.insert(bookingDogs).values(dogIds.map((dogId) => ({ bookingId: row!.id, dogId })));
        return row!.id;
      });
      const created = await findOne(eq(bookings.id, id));
      if (!created) throw new Error('Booking not readable after insert');
      return created;
    },

    findOwn: (userId, bookingId) => findOne(and(eq(bookings.id, bookingId), eq(bookings.userId, userId))),

    findById: (bookingId) => findOne(eq(bookings.id, bookingId)),

    listUpcoming: (userId, limit) =>
      select(and(eq(bookings.userId, userId), eq(bookings.status, 'confirmed'), gt(bookings.endsAt, sql`now()`)), 'asc', limit),

    listPast: (userId, limit) =>
      select(
        and(eq(bookings.userId, userId), or(eq(bookings.status, 'cancelled'), eq(bookings.status, 'completed'), lte(bookings.endsAt, sql`now()`))),
        'desc',
        limit,
      ),

    async cancel(userId, bookingId) {
      // Conditional update: two taps on "Tühista" at once cancel (and notify) only once.
      const rows = await db
        .update(bookings)
        .set({ status: 'cancelled', cancelledAt: sql`now()` })
        .where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId), eq(bookings.status, 'confirmed')))
        .returning({ id: bookings.id });
      return rows.length > 0;
    },
  };
}
