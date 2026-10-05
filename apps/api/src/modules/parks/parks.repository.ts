import type { CreateParkInput, ParkFeatureFilters } from '@kapp/shared';
import { and, eq, sql, type SQL } from 'drizzle-orm';

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

export interface ParkDetailRecord extends ParkRecord {
  ratingAverage: number | null;
  reviewCount: number;
  /** Only computed when a viewer id is given. */
  isFavorite?: boolean;
}

export interface ParksRepository {
  findApprovedNearby(
    origin: { lat: number; lng: number },
    radiusKm: number,
    limit: number,
    filters?: ParkFeatureFilters,
  ): Promise<ParkRecord[]>;
  findById(id: string, viewerId?: string): Promise<ParkDetailRecord | null>;
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

/**
 * Correlated subqueries must reference the outer row as "parks"."id" explicitly: in a
 * single-table select Drizzle renders ${parks.id} as a bare "id", which inside the subquery
 * would bind to the inner table's id column and silently match nothing.
 */
const OUTER_PARK_ID = sql.raw('"parks"."id"');

/** Dogs currently checked in (not ended, not expired) — the "6 koera praegu" counter. */
const activeDogs = sql<number>`(
  select count(*)::int from check_in_dogs cid
  join check_ins ci on ci.id = cid.check_in_id
  where ci.park_id = ${OUTER_PARK_ID} and ci.ended_at is null and ci.expires_at > now()
)`;

function toRecord<T extends { location: { x: number; y: number } }>({ location, ...rest }: T) {
  return { ...rest, lat: location.y, lng: location.x };
}

/** Only `true` narrows the result; an unset or false filter means "don't care". */
function featureConditions(filters: ParkFeatureFilters = {}): SQL[] {
  const conditions: SQL[] = [];
  if (filters.fenced) conditions.push(eq(parks.fenced, true));
  if (filters.smallDogArea) conditions.push(eq(parks.smallDogArea, true));
  if (filters.water) conditions.push(eq(parks.water, true));
  if (filters.lighting) conditions.push(eq(parks.lighting, true));
  return conditions;
}

export function createParksRepository(db: Db): ParksRepository {
  return {
    async findApprovedNearby({ lat, lng }, radiusKm, limit, filters) {
      // geography casts make ST_DWithin / ST_Distance work in metres on the WGS84 ellipsoid.
      const origin = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
      const distanceKm = sql<number>`ST_Distance(${parks.location}::geography, ${origin}) / 1000`;
      const rows = await db
        .select({ ...columns, distanceKm, activeDogs })
        .from(parks)
        .where(
          and(
            eq(parks.status, 'approved'),
            sql`ST_DWithin(${parks.location}::geography, ${origin}, ${radiusKm * 1000})`,
            ...featureConditions(filters),
          ),
        )
        .orderBy(distanceKm)
        .limit(limit);
      return rows.map((r) => ({ ...toRecord(r), distanceKm: Number(r.distanceKm) }));
    },

    async findById(id, viewerId) {
      const [row] = await db
        .select({
          ...columns,
          activeDogs,
          // Subqueries instead of joins: one row per park, no GROUP BY over all columns.
          ratingAverage: sql<number | null>`(select round(avg(r.rating)::numeric, 1)::float from reviews r where r.park_id = ${OUTER_PARK_ID})`,
          reviewCount: sql<number>`(select count(*)::int from reviews r where r.park_id = ${OUTER_PARK_ID})`,
          isFavorite: viewerId
            ? sql<boolean>`exists(select 1 from favorite_parks f where f.park_id = ${OUTER_PARK_ID} and f.user_id = ${viewerId})`
            : sql<null>`null`,
        })
        .from(parks)
        .where(eq(parks.id, id))
        .limit(1);
      if (!row) return null;
      const { isFavorite, ...rest } = row;
      return { ...toRecord(rest), ...(viewerId ? { isFavorite: Boolean(isFavorite) } : {}) };
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
