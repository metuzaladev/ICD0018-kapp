import type { CreateParkInput } from '@kapp/shared';
import { and, eq, sql } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { parks } from '../../db/schema';

/**
 * Data access for parks — the only file in this module that knows about SQL and PostGIS.
 *
 * Why a separate repository: the service holds the rules (visibility, timeouts, rounding) and
 * can be unit-tested with a mocked repository; this file is covered by integration tests
 * against a real PostGIS database.
 */

/** Database-agnostic park shape handed to the service (coordinates already unpacked). */
export interface ParkRecord {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  lat: number;
  lng: number;
  fenced: boolean;
  smallDogArea: boolean;
  water: boolean;
  lighting: boolean;
  status: 'pending' | 'approved' | 'rejected';
  distanceKm?: number;
  activeDogs?: number;
}

export interface ParksRepository {
  findApprovedNearby(origin: { lat: number; lng: number }, radiusKm: number, limit: number): Promise<ParkRecord[]>;
  findById(id: string): Promise<ParkRecord | null>;
  create(input: CreateParkInput & { createdBy: string }): Promise<ParkRecord>;
}

const columns = {
  id: parks.id,
  name: parks.name,
  description: parks.description,
  address: parks.address,
  location: parks.location,
  fenced: parks.fenced,
  smallDogArea: parks.smallDogArea,
  water: parks.water,
  lighting: parks.lighting,
  status: parks.status,
};

/** Dogs currently checked in (not ended, not expired) — the "6 koera praegu" counter. */
const activeDogs = sql<number>`(
  select count(*)::int from check_in_dogs cid
  join check_ins ci on ci.id = cid.check_in_id
  where ci.park_id = ${parks.id} and ci.ended_at is null and ci.expires_at > now()
)`;

function toRecord<T extends { location: { x: number; y: number } }>({ location, ...rest }: T) {
  return { ...rest, lat: location.y, lng: location.x };
}

export function createParksRepository(db: Db): ParksRepository {
  return {
    async findApprovedNearby({ lat, lng }, radiusKm, limit) {
      // geography casts make ST_DWithin / ST_Distance work in metres on the WGS84 ellipsoid.
      const origin = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
      const distanceKm = sql<number>`ST_Distance(${parks.location}::geography, ${origin}) / 1000`;
      const rows = await db
        .select({ ...columns, distanceKm, activeDogs })
        .from(parks)
        .where(
          and(eq(parks.status, 'approved'), sql`ST_DWithin(${parks.location}::geography, ${origin}, ${radiusKm * 1000})`),
        )
        .orderBy(distanceKm)
        .limit(limit);
      return rows.map((r) => ({ ...toRecord(r), distanceKm: Number(r.distanceKm) }));
    },

    async findById(id) {
      const [row] = await db
        .select({ ...columns, activeDogs })
        .from(parks)
        .where(eq(parks.id, id))
        .limit(1);
      return row ? toRecord(row) : null;
    },

    async create({ lat, lng, createdBy, ...input }) {
      const [row] = await db
        .insert(parks)
        .values({ ...input, location: { x: lng, y: lat }, createdBy, status: 'pending' })
        .returning(columns);
      if (!row) throw new Error('Insert returned no row');
      return toRecord(row);
    },
  };
}
