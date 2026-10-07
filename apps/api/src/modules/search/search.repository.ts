import { SEARCH_LOCAL_LIMIT, type SearchResult } from '@kapp/shared';
import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { blockedBetween } from '../safety/block-sql';

export interface SearchRepository {
  /** Approved parks, service providers and approved community picks whose name (or address) matches. */
  places(viewerId: string | undefined, query: string, origin: { lat: number; lng: number } | undefined): Promise<SearchResult[]>;
}

/** ILIKE pattern for "contains", with the user's % and _ taken literally. */
export function containsPattern(query: string): string {
  return `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Zoom that frames a single place on the map (the same level as a post's "Kaardil"). */
const PLACE_ZOOM = 15;

/**
 * Local half of the map search (docs/19). Plain ILIKE on name (and park address) is enough for a
 * few hundred places; when it grows, a pg_trgm index is the next step. Ordering: names that start
 * with the query first ("Kalamaja" before "Põhja-Kalamaja"), then the nearest. Each source is
 * capped separately so 71 parks cannot crowd out a provider. Community picks hide authors blocked
 * in either direction, like the feed.
 */
export function createSearchRepository(db: Db): SearchRepository {
  return {
    async places(viewerId, query, origin) {
      const contains = containsPattern(query);
      const prefix = `${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const here = origin ? sql`ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography` : null;
      const distance = (col: string) => (here ? sql`round((ST_Distance(${sql.raw(col)}::geography, ${here}) / 1000)::numeric, 1)::float8` : sql`null::float8`);
      const order = (nameCol: string, col: string) =>
        here ? sql`(${sql.raw(nameCol)} ilike ${prefix}) desc, ${sql.raw(col)}::geography <-> ${here}` : sql`(${sql.raw(nameCol)} ilike ${prefix}) desc, ${sql.raw(nameCol)}`;
      const postVisible = viewerId ? sql`not ${blockedBetween(sql`${viewerId}`, sql.raw('p.author_id'))}` : sql`true`;

      const { rows } = await db.execute<{ kind: SearchResult['kind']; id: string; name: string; subtitle: string | null; category: string | null; lat: number; lng: number; distance_km: number | null }>(sql`
        (select 'park' as kind, k.id::text, k.name, k.address as subtitle,
                case when k.water and not k.fenced then 'beach' else 'park' end as category,
                ST_Y(k.location) as lat, ST_X(k.location) as lng, ${distance('k.location')} as distance_km
           from parks k
          where k.status = 'approved' and (k.name ilike ${contains} or k.address ilike ${contains})
          order by ${order('k.name', 'k.location')}
          limit ${SEARCH_LOCAL_LIMIT})
        union all
        (select 'provider', s.id::text, s.name, s.area, s.category::text,
                ST_Y(s.location), ST_X(s.location), ${distance('s.location')}
           from service_providers s
          where s.name ilike ${contains}
          order by ${order('s.name', 's.location')}
          limit ${SEARCH_LOCAL_LIMIT})
        union all
        (select 'post', p.id::text, p.name, p.address, p.category::text,
                ST_Y(p.location), ST_X(p.location), ${distance('p.location')}
           from place_posts p
          where p.status = 'approved' and p.name ilike ${contains} and ${postVisible}
          order by ${order('p.name', 'p.location')}
          limit ${SEARCH_LOCAL_LIMIT})`);

      return rows.map((r) => ({
        kind: r.kind,
        id: r.id,
        name: r.name,
        subtitle: r.subtitle,
        category: r.category,
        lat: Number(r.lat),
        lng: Number(r.lng),
        zoom: PLACE_ZOOM,
        distanceKm: r.distance_km === null ? null : Number(r.distance_km),
      }));
    },
  };
}
