import type {
  ActiveCheckIn,
  CheckInInput,
  ParkVisitors,
  PlannedVisit,
  PlannedVisitInput,
  VisitHistoryItem,
} from '@kapp/shared';

import { ConflictError, NotFoundError } from '../../http/errors';
import { isUniqueViolation } from '../../lib/db-errors';
import { withTimeout } from '../../lib/timeout';
import type { DogsRepository } from '../dogs/dogs.repository';
import type { ParksRepository } from '../parks/parks.repository';
import { isPublic } from '../parks/parks.service';
import type { RewardsService } from '../rewards/rewards.service';
import type { VisitsRepository } from './visits.repository';

/** Rules for being in a park now (check-in), who else is there, and planning a visit. */
export interface VisitsService {
  checkIn(userId: string, input: CheckInInput): Promise<ActiveCheckIn>;
  getActive(userId: string): Promise<ActiveCheckIn | null>;
  endCheckIn(userId: string, checkInId: string): Promise<void>;
  listVisitors(parkId: string, viewerId: string): Promise<ParkVisitors>;
  history(userId: string): Promise<VisitHistoryItem[]>;
  planVisit(userId: string, input: PlannedVisitInput): Promise<PlannedVisit>;
  listPlans(userId: string): Promise<PlannedVisit[]>;
  cancelPlan(userId: string, planId: string): Promise<void>;
}

const HISTORY_LIMIT = 50;

export function createVisitsService({
  visits,
  parks,
  dogs,
  timeoutMs,
  onPlanCreated,
  rewards,
}: {
  visits: VisitsRepository;
  parks: Pick<ParksRepository, 'findById'>;
  dogs: Pick<DogsRepository, 'ownedIds'>;
  timeoutMs: number;
  /** M5: tells friends about the plan. Best effort — must not throw (FriendsService.announcePlan). */
  onPlanCreated?: (userId: string, plan: PlannedVisit) => Promise<void>;
  /**
   * M9b Käpad: settled after a check-in starts (it may have closed the previous one) and after one
   * ends. Never throws; a check-in that simply runs out is settled on the next of these or when the
   * rewards screen opens (docs/16).
   */
  rewards?: Pick<RewardsService, 'settle'>;
}): VisitsService {
  const t = <T>(p: Promise<T>, label: string) => withTimeout(p, timeoutMs, label);

  async function requirePublicPark(parkId: string) {
    if (!isPublic(await t(parks.findById(parkId), 'parks.findById'))) throw new NotFoundError('errors.parkNotFound');
  }

  return {
    async checkIn(userId, input) {
      await requirePublicPark(input.parkId);
      // Only the user's own dogs; same 404 for missing and foreign ids (no enumeration).
      const owned = await t(dogs.ownedIds(userId, input.dogIds), 'dogs.ownedIds');
      if (owned.length !== input.dogIds.length) throw new NotFoundError('errors.dogNotFound');
      try {
        const created = await t(visits.createCheckIn({ userId, ...input }), 'visits.createCheckIn');
        await rewards?.settle(userId);
        return created;
      } catch (error) {
        // Two check-ins at the same moment: the unique index lets exactly one through.
        if (isUniqueViolation(error, 'check_ins_one_open_per_user_uq')) {
          throw new ConflictError('errors.checkInExists');
        }
        throw error;
      }
    },

    getActive: (userId) => t(visits.findActive(userId), 'visits.findActive'),

    async endCheckIn(userId, checkInId) {
      const result = await t(visits.endCheckIn(userId, checkInId), 'visits.endCheckIn');
      // Ending an already finished visit is fine (idempotent); someone else's is "not found".
      if (result === 'not-found') throw new NotFoundError('errors.visitNotFound');
      if (result === 'ended') await rewards?.settle(userId);
    },

    async listVisitors(parkId, viewerId) {
      await requirePublicPark(parkId);
      return t(visits.listVisitors(parkId, viewerId), 'visits.listVisitors');
    },

    history: (userId) => t(visits.history(userId, HISTORY_LIMIT), 'visits.history'),

    async planVisit(userId, input) {
      await requirePublicPark(input.parkId);
      const plan = await t(visits.createPlan(userId, input), 'visits.createPlan');
      await onPlanCreated?.(userId, plan);
      return plan;
    },

    listPlans: (userId) => t(visits.listUpcomingPlans(userId), 'visits.listPlans'),

    async cancelPlan(userId, planId) {
      if (!(await t(visits.deletePlan(userId, planId), 'visits.deletePlan'))) throw new NotFoundError('errors.planNotFound');
    },
  };
}
