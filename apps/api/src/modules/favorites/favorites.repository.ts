import { and, desc, eq } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { favoriteParks, parks } from '../../db/schema';
import type { ParkRecord } from '../parks/parks.repository';

/** Data access for "Lemmikpargid" (table favorite_parks, composite key user_id + park_id). */
export interface FavoritesRepository {
  /** Idempotent: adding an existing favourite is a no-op. */
  add(userId: string, parkId: string): Promise<void>;
  /** Idempotent: removing a missing favourite is a no-op. */
  remove(userId: string, parkId: string): Promise<void>;
  /** Approved parks only, newest favourite first. */
  listParks(userId: string): Promise<ParkRecord[]>;
}

export function createFavoritesRepository(db: Db): FavoritesRepository {
  return {
    async add(userId, parkId) {
      await db.insert(favoriteParks).values({ userId, parkId }).onConflictDoNothing();
    },

    async remove(userId, parkId) {
      await db.delete(favoriteParks).where(and(eq(favoriteParks.userId, userId), eq(favoriteParks.parkId, parkId)));
    },

    async listParks(userId) {
      const rows = await db
        .select({
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
        })
        .from(favoriteParks)
        .innerJoin(parks, eq(parks.id, favoriteParks.parkId))
        // A favourite park that later gets rejected disappears from the list but is not deleted.
        .where(and(eq(favoriteParks.userId, userId), eq(parks.status, 'approved')))
        .orderBy(desc(favoriteParks.createdAt))
        .limit(200);
      return rows.map(({ location, ...rest }) => ({ ...rest, lat: location.y, lng: location.x }));
    },
  };
}
