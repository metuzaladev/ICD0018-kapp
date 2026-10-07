import type { ParkActivityResponse } from '@kapp/shared';

import { withTimeout } from '../../lib/timeout';
import { bucketPlans, dayPartWindows, TIME_ZONE } from './day-parts';
import type { ParkActivityRepository } from './park-activity.repository';

/** "Lemmikparkides täna" on Home (M11, docs/18): dogs now + today's planned visits per park. */
export interface ParkActivityService {
  today(viewerId: string, parkIds: string[]): Promise<ParkActivityResponse>;
}

export function createParkActivityService({
  repository,
  timeoutMs,
  now = () => new Date(),
}: {
  repository: ParkActivityRepository;
  timeoutMs: number;
  /** Injectable clock for tests. */
  now?: () => Date;
}): ParkActivityService {
  return {
    async today(viewerId, parkIds) {
      const at = now();
      const { date, windows } = dayPartWindows(at, TIME_ZONE);
      // Unknown and unapproved ids are simply left out: the batch answer cannot tell a missing park
      // from a hidden one, which is the same guarantee as the 404 of GET /parks/:id (docs/06).
      const parks = await withTimeout(repository.findPublicParks(parkIds), timeoutMs, 'parkActivity.findPublicParks');
      if (parks.length === 0) return { date, parks: [] };
      const plans = await withTimeout(
        repository.visiblePlans(viewerId, parks.map((p) => p.id), windows[0]!.start, windows[windows.length - 1]!.end),
        timeoutMs,
        'parkActivity.visiblePlans',
      );
      const byId = new Map(parks.map((p) => [p.id, p]));
      return {
        date,
        parks: parkIds.flatMap((id) => {
          const park = byId.get(id);
          if (!park) return [];
          return [{ ...park, ...bucketPlans(plans.filter((p) => p.parkId === id), windows, at) }];
        }),
      };
    },
  };
}
