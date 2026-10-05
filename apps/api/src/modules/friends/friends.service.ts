import {
  FRIEND_PLANS_HOURS,
  USER_SEARCH_LIMIT,
  type Friend,
  type FriendPlan,
  type FriendRequestResult,
  type FriendRequests,
  type PlannedVisit,
  type UserProfile,
  type UserSearchResult,
} from '@kapp/shared';

import { BadRequestError, ForbiddenError, NotFoundError } from '../../http/errors';
import { isUniqueViolation } from '../../lib/db-errors';
import { withTimeout } from '../../lib/timeout';
import type { Notifier } from '../notifications/notifier';
import type { FriendsRepository, FriendshipRow } from './friends.repository';

/**
 * Mutual friendship with a request (M5 decision, docs/12-kogukond.md): A asks, B accepts or
 * declines, either can remove it later. Asking someone who has already asked you simply accepts.
 */
export interface FriendsService {
  /** `created` = a new pending request was stored (HTTP 201); otherwise the state already existed (200). */
  sendRequest(userId: string, targetId: string): Promise<{ result: FriendRequestResult; created: boolean }>;
  acceptRequest(userId: string, requesterId: string): Promise<void>;
  /** Declines an incoming or cancels an outgoing request. Idempotent. */
  deleteRequest(userId: string, otherId: string): Promise<void>;
  removeFriend(userId: string, otherId: string): Promise<void>;
  listFriends(userId: string): Promise<Friend[]>;
  listRequests(userId: string): Promise<FriendRequests>;
  search(userId: string, query: string): Promise<UserSearchResult[]>;
  getProfile(userId: string, targetId: string): Promise<UserProfile>;
  friendPlans(userId: string): Promise<FriendPlan[]>;
  /** Called after a plan is saved: tells friends (best effort, never throws). */
  announcePlan(userId: string, plan: PlannedVisit): Promise<void>;
}

export function createFriendsService({
  repository,
  notifier,
  timeoutMs,
}: {
  repository: FriendsRepository;
  notifier: Notifier;
  timeoutMs: number;
}): FriendsService {
  const t = <T>(p: Promise<T>, label: string) => withTimeout(p, timeoutMs, label);

  /** Applies "send a request" to the current state of the pair; null = no row yet. */
  async function resolveExisting(userId: string, targetId: string, existing: FriendshipRow): Promise<FriendRequestResult> {
    if (existing.status === 'accepted') return { status: 'accepted' };
    if (existing.requesterId === userId) return { status: 'pending' };
    // They asked first: asking back accepts.
    if (await t(repository.accept(targetId, userId), 'friends.accept')) {
      await notifier.notify({ type: 'friend_accepted', recipientId: targetId, actorId: userId, data: {} });
    }
    return { status: 'accepted' };
  }

  return {
    async sendRequest(userId, targetId) {
      if (userId === targetId) throw new BadRequestError('errors.cannotFriendSelf');
      // Missing and blocked (either way) look the same: 404, nothing to learn about the account.
      const target = await t(repository.findTarget(userId, targetId), 'friends.findTarget');
      if (!target) throw new NotFoundError('errors.userNotFound');

      const existing = await t(repository.findFriendship(userId, targetId), 'friends.findFriendship');
      if (existing) return { result: await resolveExisting(userId, targetId, existing), created: false };
      if (!target.allowFriendRequests) throw new ForbiddenError('errors.friendRequestsDisabled');

      try {
        await t(repository.createRequest(userId, targetId), 'friends.createRequest');
      } catch (error) {
        // Both asked at the same moment: the pair index let only one row in. Treat ours like a late
        // arrival and apply the normal rules to the row that won.
        if (!isUniqueViolation(error)) throw error;
        const winner = await t(repository.findFriendship(userId, targetId), 'friends.findFriendship');
        if (!winner) throw error;
        return { result: await resolveExisting(userId, targetId, winner), created: false };
      }
      await notifier.notify({ type: 'friend_request', recipientId: targetId, actorId: userId, data: {} });
      return { result: { status: 'pending' }, created: true };
    },

    async acceptRequest(userId, requesterId) {
      if (await t(repository.accept(requesterId, userId), 'friends.accept')) {
        await notifier.notify({ type: 'friend_accepted', recipientId: requesterId, actorId: userId, data: {} });
        return;
      }
      // Accepting twice is fine; accepting a request that does not exist (or is ours) is 404.
      const existing = await t(repository.findFriendship(userId, requesterId), 'friends.findFriendship');
      if (existing?.status !== 'accepted') throw new NotFoundError('errors.friendRequestNotFound');
    },

    deleteRequest: (userId, otherId) => t(repository.remove(userId, otherId, 'pending'), 'friends.removeRequest'),

    removeFriend: (userId, otherId) => t(repository.remove(userId, otherId, 'accepted'), 'friends.removeFriend'),

    listFriends: (userId) => t(repository.listFriends(userId), 'friends.listFriends'),

    listRequests: (userId) => t(repository.listRequests(userId), 'friends.listRequests'),

    search: (userId, query) => t(repository.search(userId, query, USER_SEARCH_LIMIT), 'friends.search'),

    async getProfile(userId, targetId) {
      const profile = await t(repository.profile(userId, targetId), 'friends.profile');
      if (!profile) throw new NotFoundError('errors.userNotFound');
      return profile;
    },

    friendPlans: (userId) => t(repository.friendPlans(userId, FRIEND_PLANS_HOURS), 'friends.friendPlans'),

    async announcePlan(userId, plan) {
      let audience: string[];
      try {
        audience = await t(repository.planAudience(userId), 'friends.planAudience');
      } catch {
        return; // The plan is saved; telling friends is best effort.
      }
      const data = { planId: plan.id, parkId: plan.park.id, parkName: plan.park.name, startsAt: plan.startsAt, endsAt: plan.endsAt };
      for (const friendId of audience) {
        await notifier.notify({ type: 'friend_plan', recipientId: friendId, actorId: userId, data });
      }
    },
  };
}
