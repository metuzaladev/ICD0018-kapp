import type { Review, ReviewInput } from '@kapp/shared';

import { ForbiddenError, NotFoundError } from '../../http/errors';
import { withTimeout } from '../../lib/timeout';
import type { ParksRepository } from '../parks/parks.repository';
import { isPublic } from '../parks/parks.service';
import type { ReviewsRepository } from './reviews.repository';

export interface ReviewsService {
  /** Creates or replaces the user's review. Only users who have checked in there may review. */
  submit(userId: string, parkId: string, input: ReviewInput): Promise<Review>;
  list(parkId: string, viewerId?: string): Promise<Review[]>;
}

export const REVIEWS_PAGE_SIZE = 20;

export function createReviewsService({
  reviews,
  parks,
  timeoutMs,
}: {
  reviews: ReviewsRepository;
  parks: Pick<ParksRepository, 'findById'>;
  timeoutMs: number;
}): ReviewsService {
  const t = <T>(p: Promise<T>, label: string) => withTimeout(p, timeoutMs, label);

  async function requirePublicPark(parkId: string) {
    if (!isPublic(await t(parks.findById(parkId), 'parks.findById'))) throw new NotFoundError('errors.parkNotFound');
  }

  return {
    async submit(userId, parkId, input) {
      await requirePublicPark(parkId);
      // A check-in is the proof of a visit: stops drive-by ratings of parks nobody went to.
      if (!(await t(reviews.hasVisited(userId, parkId), 'reviews.hasVisited'))) {
        throw new ForbiddenError('errors.reviewNeedsVisit');
      }
      return t(reviews.upsert(userId, parkId, input), 'reviews.upsert');
    },

    async list(parkId, viewerId) {
      await requirePublicPark(parkId);
      return t(reviews.listForPark(parkId, viewerId, REVIEWS_PAGE_SIZE), 'reviews.list');
    },
  };
}
