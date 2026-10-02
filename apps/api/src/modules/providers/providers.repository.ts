import type { ServiceCategory } from '@kapp/shared';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { serviceProviders, services } from '../../db/schema';

/**
 * Data access for the service catalogue (M6): providers, their services and free times.
 * The slot generator lives here because it is one SQL statement over opening hours, time zones and
 * bookings; the rules it filters by (cutoff, horizon) are decided by the service and passed in.
 */

export interface ProviderRecord {
  id: string;
  name: string;
  category: ServiceCategory;
  tagline: string | null;
  area: string;
  lat: number;
  lng: number;
  photoKey: string | null;
  ratingAverage: number | null;
  ratingCount: number;
  priceFromCents: number | null;
  distanceKm?: number;
}

export interface ServiceRecord {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  priceIsFrom: boolean;
}

export interface ProviderDetailRecord extends ProviderRecord {
  description: string | null;
  address: string | null;
  timeZone: string;
  services: ServiceRecord[];
}

/** A service with what booking it needs to know about its provider. */
export interface BookableServiceRecord extends ServiceRecord {
  provider: { id: string; name: string; category: ServiceCategory; area: string; address: string | null; timeZone: string };
}

export interface FreeSlotRecord {
  /** Calendar date in the provider's zone, "2026-10-03". */
  day: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ProvidersRepository {
  list(filter: { category?: ServiceCategory; origin?: { lat: number; lng: number }; radiusKm: number }, limit: number): Promise<ProviderRecord[]>;
  findById(id: string): Promise<ProviderDetailRecord | null>;
  findService(serviceId: string): Promise<BookableServiceRecord | null>;
  /**
   * Free start times of a service on `days` calendar days from `from` (provider's zone): on the
   * SLOT_STEP grid inside opening hours, long enough for the service before closing, not overlapping
   * any active booking of the provider, and within [notBefore, notAfter].
   */
  findFreeSlots(input: { serviceId: string; from: string; days: number; stepMinutes: number; notBefore: Date; notAfter: Date }): Promise<FreeSlotRecord[]>;
}

/** See parks.repository.ts: correlated subqueries must name the outer row explicitly. */
const OUTER_PROVIDER_ID = sql.raw('"service_providers"."id"');

const priceFromCents = sql<number | null>`(select min(s.price_cents)::int from services s where s.provider_id = ${OUTER_PROVIDER_ID})`;

const summaryColumns = {
  id: serviceProviders.id,
  name: serviceProviders.name,
  category: serviceProviders.category,
  tagline: serviceProviders.tagline,
  area: serviceProviders.area,
  location: serviceProviders.location,
  photoKey: serviceProviders.photoKey,
  ratingAverage: serviceProviders.ratingAverage,
  ratingCount: serviceProviders.ratingCount,
  priceFromCents,
};

const serviceColumns = {
  id: services.id,
  name: services.name,
  description: services.description,
  durationMinutes: services.durationMinutes,
  priceCents: services.priceCents,
  priceIsFrom: services.priceIsFrom,
};

function toRecord<T extends { location: { x: number; y: number }; ratingAverage: number | null }>({ location, ratingAverage, ...rest }: T) {
  // numeric arrives as a string from pg unless mapped; Number() keeps the record a plain number either way.
  return { ...rest, lat: location.y, lng: location.x, ratingAverage: ratingAverage === null ? null : Number(ratingAverage) };
}

export function createProvidersRepository(db: Db): ProvidersRepository {
  return {
    async list({ category, origin, radiusKm }, limit) {
      const conditions: SQL[] = [];
      if (category) conditions.push(eq(serviceProviders.category, category));
      if (!origin) {
        const rows = await db
          .select(summaryColumns)
          .from(serviceProviders)
          .where(and(...conditions))
          .orderBy(asc(serviceProviders.name))
          .limit(limit);
        return rows.map(toRecord);
      }
      // Same geography maths as parks: metres on the WGS84 ellipsoid, GiST index via ST_DWithin.
      const point = sql`ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography`;
      const distanceKm = sql<number>`ST_Distance(${serviceProviders.location}::geography, ${point}) / 1000`;
      const rows = await db
        .select({ ...summaryColumns, distanceKm })
        .from(serviceProviders)
        .where(and(sql`ST_DWithin(${serviceProviders.location}::geography, ${point}, ${radiusKm * 1000})`, ...conditions))
        .orderBy(distanceKm, asc(serviceProviders.name))
        .limit(limit);
      return rows.map((r) => ({ ...toRecord(r), distanceKm: Number(r.distanceKm) }));
    },

    async findById(id) {
      const [row] = await db
        .select({
          ...summaryColumns,
          description: serviceProviders.description,
          address: serviceProviders.address,
          timeZone: serviceProviders.timeZone,
        })
        .from(serviceProviders)
        .where(eq(serviceProviders.id, id))
        .limit(1);
      if (!row) return null;
      // Cheapest first, the order of the "alates" prices on the Figma screen.
      const list = await db
        .select(serviceColumns)
        .from(services)
        .where(eq(services.providerId, id))
        .orderBy(asc(services.priceCents), asc(services.name));
      return { ...toRecord(row), services: list };
    },

    async findService(serviceId) {
      const [row] = await db
        .select({
          ...serviceColumns,
          providerId: serviceProviders.id,
          providerName: serviceProviders.name,
          category: serviceProviders.category,
          area: serviceProviders.area,
          address: serviceProviders.address,
          timeZone: serviceProviders.timeZone,
        })
        .from(services)
        .innerJoin(serviceProviders, eq(serviceProviders.id, services.providerId))
        .where(eq(services.id, serviceId))
        .limit(1);
      if (!row) return null;
      const { providerId, providerName, category, area, address, timeZone, ...service } = row;
      return { ...service, provider: { id: providerId, name: providerName, category, area, address, timeZone } };
    },

    async findFreeSlots({ serviceId, from, days, stepMinutes, notBefore, notAfter }) {
      // date + time = local wall-clock timestamp; `at time zone` turns it into an instant in the
      // provider's zone, so 10.00 stays 10.00 across daylight-saving changes.
      const result = await db.execute<{ day: string; starts_at: string | Date; ends_at: string | Date }>(sql`
        with svc as (
          select s.id, s.duration_minutes, p.id as provider_id, p.time_zone
          from services s join service_providers p on p.id = s.provider_id
          where s.id = ${serviceId}
        ),
        days as (
          select d::date as day
          from generate_series(${from}::date, ${from}::date + (${days}::int - 1), interval '1 day') d
        ),
        windows as (
          select days.day,
                 (days.day + h.opens_at) at time zone svc.time_zone as opens,
                 (days.day + h.closes_at) at time zone svc.time_zone as closes
          from svc
          cross join days
          join provider_hours h on h.provider_id = svc.provider_id and h.weekday = extract(isodow from days.day)
        ),
        candidates as (
          select w.day, gs as starts_at, gs + make_interval(mins => svc.duration_minutes) as ends_at
          from windows w
          cross join svc
          cross join lateral generate_series(
            w.opens,
            w.closes - make_interval(mins => svc.duration_minutes),
            make_interval(mins => ${stepMinutes}::int)
          ) gs
        )
        select to_char(c.day, 'YYYY-MM-DD') as day, c.starts_at, c.ends_at
        from candidates c
        cross join svc
        where c.starts_at >= ${notBefore.toISOString()}::timestamptz
          and c.starts_at <= ${notAfter.toISOString()}::timestamptz
          and not exists (
            select 1 from bookings b
            where b.provider_id = svc.provider_id
              and b.status <> 'cancelled'
              and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(c.starts_at, c.ends_at, '[)')
          )
        order by c.starts_at
      `);
      return result.rows.map((r) => ({ day: r.day, startsAt: new Date(r.starts_at), endsAt: new Date(r.ends_at) }));
    },
  };
}
