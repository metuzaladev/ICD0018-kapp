import type { CreateParkInput, NearbyParksQuery, Park, ParkDetail } from '@kapp/shared';

import { NotFoundError } from '../../http/errors';
import { withTimeout } from '../../lib/timeout';
import type { ParkDetailRecord, ParkRecord, ParksRepository } from './parks.repository';

/**
 * Business rules for parks. Knows nothing about HTTP (no request/reply) or SQL (no Drizzle),
 * which is what makes it unit-testable with a mocked repository.
 */
export interface ParksService {
  listNearby(query: NearbyParksQuery): Promise<Park[]>;
  /** `viewerId` is set for signed-in users and adds `isFavorite`. */
  getPublicPark(parkId: string, viewerId?: string): Promise<ParkDetail>;
  suggestPark(userId: string, input: CreateParkInput): Promise<Park>;
}

export interface ParksServiceDeps {
  repository: ParksRepository;
  /** Max time for one repository call before the request fails with 503. */
  timeoutMs: number;
}

/** Hard cap so a client can never request an unbounded result set. */
export const NEARBY_LIMIT = 50;

function roundDistance<T extends ParkRecord>(record: T): T {
  // One decimal is what the UI shows ("1,2 km") and avoids leaking exact user position math.
  return {
    ...record,
    distanceKm: record.distanceKm === undefined ? undefined : Math.round(record.distanceKm * 10) / 10,
  };
}

/** Pending and rejected parks are not public. */
export function isPublic(record: ParkRecord | null): record is ParkRecord {
  return record !== null && record.status === 'approved';
}

export function createParksService({ repository, timeoutMs }: ParksServiceDeps): ParksService {
  return {
    async listNearby({ lat, lng, radiusKm, ...filters }) {
      const records = await withTimeout(
        repository.findApprovedNearby({ lat, lng }, radiusKm, NEARBY_LIMIT, filters),
        timeoutMs,
        'parks.findApprovedNearby',
      );
      return records.map(roundDistance);
    },

    async getPublicPark(parkId, viewerId) {
      const record: ParkDetailRecord | null = await withTimeout(
        repository.findById(parkId, viewerId),
        timeoutMs,
        'parks.findById',
      );
      // Answer 404, not 403, so the API does not reveal that an unmoderated park with this id exists.
      if (!isPublic(record)) throw new NotFoundError('Parki ei leitud');
      return roundDistance(record as ParkDetailRecord);
    },

    async suggestPark(userId, input) {
      const record = await withTimeout(repository.create({ ...input, createdBy: userId }), timeoutMs, 'parks.create');
      return roundDistance(record);
    },
  };
}
