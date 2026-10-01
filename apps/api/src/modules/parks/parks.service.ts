import type { CreateParkInput, NearbyParksQuery, Park } from '@kapp/shared';

import { NotFoundError } from '../../http/errors';
import { withTimeout } from '../../lib/timeout';
import type { ParkRecord, ParksRepository } from './parks.repository';

/**
 * Business rules for parks. Knows nothing about HTTP (no request/reply) or SQL (no Drizzle),
 * which is what makes it unit-testable with a mocked repository.
 */
export interface ParksService {
  listNearby(query: NearbyParksQuery): Promise<Park[]>;
  getPublicPark(parkId: string): Promise<Park>;
  suggestPark(userId: string, input: CreateParkInput): Promise<Park>;
}

export interface ParksServiceDeps {
  repository: ParksRepository;
  /** Max time for one repository call before the request fails with 503. */
  timeoutMs: number;
}

/** Hard cap so a client can never request an unbounded result set. */
export const NEARBY_LIMIT = 50;

function toPark(record: ParkRecord): Park {
  return {
    ...record,
    // One decimal is what the UI shows ("1,2 km") and avoids leaking exact user position math.
    distanceKm: record.distanceKm === undefined ? undefined : Math.round(record.distanceKm * 10) / 10,
  };
}

export function createParksService({ repository, timeoutMs }: ParksServiceDeps): ParksService {
  return {
    async listNearby({ lat, lng, radiusKm }) {
      const records = await withTimeout(
        repository.findApprovedNearby({ lat, lng }, radiusKm, NEARBY_LIMIT),
        timeoutMs,
        'parks.findApprovedNearby',
      );
      return records.map(toPark);
    },

    async getPublicPark(parkId) {
      const record = await withTimeout(repository.findById(parkId), timeoutMs, 'parks.findById');
      // Pending and rejected parks are not public. Answer 404, not 403, so the API does not
      // reveal that an unmoderated park with this id exists.
      if (!record || record.status !== 'approved') {
        throw new NotFoundError('Parki ei leitud');
      }
      return toPark(record);
    },

    async suggestPark(userId, input) {
      const record = await withTimeout(repository.create({ ...input, createdBy: userId }), timeoutMs, 'parks.create');
      return toPark(record);
    },
  };
}
