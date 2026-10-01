import type { Park } from '@kapp/shared';

import { NotFoundError } from '../../http/errors';
import { withTimeout } from '../../lib/timeout';
import type { ParksRepository } from '../parks/parks.repository';
import { isPublic } from '../parks/parks.service';
import type { FavoritesRepository } from './favorites.repository';

/** The signed-in user's favourite parks. */
export interface FavoritesService {
  list(userId: string): Promise<Park[]>;
  add(userId: string, parkId: string): Promise<void>;
  remove(userId: string, parkId: string): Promise<void>;
}

export function createFavoritesService({
  favorites,
  parks,
  timeoutMs,
}: {
  favorites: FavoritesRepository;
  parks: Pick<ParksRepository, 'findById'>;
  timeoutMs: number;
}): FavoritesService {
  return {
    list: (userId) => withTimeout(favorites.listParks(userId), timeoutMs, 'favorites.listParks'),

    async add(userId, parkId) {
      // Only public parks can be saved; same 404 as GET /parks/:id so ids of unmoderated parks stay hidden.
      const park = await withTimeout(parks.findById(parkId), timeoutMs, 'parks.findById');
      if (!isPublic(park)) throw new NotFoundError('errors.parkNotFound');
      await withTimeout(favorites.add(userId, parkId), timeoutMs, 'favorites.add');
    },

    // No existence check: removing is always safe and must work even after a park is rejected.
    remove: (userId, parkId) => withTimeout(favorites.remove(userId, parkId), timeoutMs, 'favorites.remove'),
  };
}
