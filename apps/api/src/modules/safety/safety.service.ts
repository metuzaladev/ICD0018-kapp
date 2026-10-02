import type { BlockedUser, UserReportInput } from '@kapp/shared';

import { BadRequestError, NotFoundError } from '../../http/errors';
import { withTimeout } from '../../lib/timeout';
import type { SafetyRepository } from './safety.repository';

/**
 * Blocking and reporting (M5). A block hides the two users from each other everywhere — search,
 * profiles, friend lists, conversations, notifications, park visitors — removes their friendship
 * and pending requests, and stops new messages. Those rules live in the SQL of each module
 * (block-sql.ts); this service only manages the block rows and reports.
 */
export interface SafetyService {
  block(userId: string, targetId: string): Promise<void>;
  unblock(userId: string, targetId: string): Promise<void>;
  listBlocked(userId: string): Promise<BlockedUser[]>;
  reportUser(userId: string, targetId: string, input: UserReportInput): Promise<{ id: string }>;
}

export function createSafetyService({ repository, timeoutMs }: { repository: SafetyRepository; timeoutMs: number }): SafetyService {
  const t = <T>(p: Promise<T>, label: string) => withTimeout(p, timeoutMs, label);

  async function requireOtherUser(userId: string, targetId: string, selfKey: 'errors.cannotBlockSelf' | 'errors.cannotReportSelf') {
    if (userId === targetId) throw new BadRequestError(selfKey);
    if (!(await t(repository.userExists(targetId), 'safety.userExists'))) throw new NotFoundError('errors.userNotFound');
  }

  return {
    async block(userId, targetId) {
      await requireOtherUser(userId, targetId, 'errors.cannotBlockSelf');
      await t(repository.block(userId, targetId), 'safety.block');
    },

    async unblock(userId, targetId) {
      // No existence check: unblocking is idempotent and must work even for a deleted account.
      if (userId === targetId) return;
      await t(repository.unblock(userId, targetId), 'safety.unblock');
    },

    listBlocked: (userId) => t(repository.listBlocked(userId), 'safety.listBlocked'),

    async reportUser(userId, targetId, input) {
      // Reporting someone you have blocked is allowed: "report, then block" is the Figma flow.
      await requireOtherUser(userId, targetId, 'errors.cannotReportSelf');
      return t(repository.createReport({ reporterId: userId, reportedId: targetId, ...input }), 'safety.createReport');
    },
  };
}
