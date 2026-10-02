import {
  FRIEND_PLANS_HOURS,
  type Invite,
  USER_SEARCH_LIMIT,
  type Friend,
  type FriendPlan,
  type FriendRequestResult,
  type FriendRequests,
  type PlannedVisit,
  type UserProfile,
  type UserSearchResult,
} from '@kapp/shared';

import { BadRequestError, ConflictError, ForbiddenError, HttpError, NotFoundError } from '../../http/errors';
import { randomCode } from '../../lib/codes';
import { isUniqueViolation } from '../../lib/db-errors';
import { withTimeout } from '../../lib/timeout';
import type { Notifier } from '../notifications/notifier';
import { REWARD_RULES } from '../rewards/reward-rules';
import type { RewardsService } from '../rewards/rewards.service';
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
  /** M9b "Kutsu sõber": the user's own invite code and what it earns. */
  getInvite(userId: string): Promise<Invite>;
  /**
   * A new user enters a friend's code: records who invited them and sends the inviter a friend
   * request. The inviter's Käpad come later, with the invitee's first qualifying check-in.
   */
  claimInvite(userId: string, code: string): Promise<void>;
}

export const INVITE_CODE_LENGTH = 8;

export function createFriendsService({
  repository,
  notifier,
  rewards,
  timeoutMs,
  now = () => new Date(),
}: {
  repository: FriendsRepository;
  notifier: Notifier;
  /** M9b: settles Käpad after an invite claim (never throws). */
  rewards?: Pick<RewardsService, 'settle'>;
  timeoutMs: number;
  now?: () => Date;
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

  const service: FriendsService = {
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

    async getInvite(userId) {
      // ≈40 bits: a collision with another user's code is practically impossible; one retry makes it moot.
      for (let attempt = 0; ; attempt++) {
        try {
          const code = await t(repository.inviteCode(userId, randomCode(INVITE_CODE_LENGTH)), 'friends.inviteCode');
          return { code, points: REWARD_RULES.invite.points };
        } catch (error) {
          if (attempt > 0 || !isUniqueViolation(error, 'invite_codes_code_unique')) throw error;
        }
      }
    },

    async claimInvite(userId, code) {
      // Missing code and a blocked pair look the same (no account enumeration through codes).
      const inviter = await t(repository.findInviter(userId, code), 'friends.findInviter');
      if (!inviter) throw new NotFoundError('errors.inviteNotFound');
      if (inviter.id === userId) throw new BadRequestError('errors.inviteOwnCode');
      // Only new accounts: otherwise two long-time users could swap codes for free points.
      const createdAt = await t(repository.accountCreatedAt(userId), 'friends.accountCreatedAt');
      const windowDays = REWARD_RULES.invite.claimWindowDays;
      if (!createdAt || now().getTime() - createdAt.getTime() > windowDays * 86_400_000) {
        throw new ConflictError('errors.inviteTooLate', { days: windowDays });
      }
      try {
        await t(repository.createReferral(userId, inviter.id), 'friends.createReferral');
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('errors.inviteAlreadyClaimed');
        throw error;
      }
      // The friendship is a nicety on top of the referral: a refused request must not fail the claim.
      try {
        await service.sendRequest(userId, inviter.id);
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
      }
      await rewards?.settle(userId);
    },
  };
  return service;
}
