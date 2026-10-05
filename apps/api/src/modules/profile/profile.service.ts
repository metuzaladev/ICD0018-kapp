import type { Profile, UpdateProfileInput } from '@kapp/shared';

import { NotFoundError } from '../../http/errors';
import { withTimeout } from '../../lib/timeout';
import type { ProfileRepository } from './profile.repository';

/** The signed-in user's own profile ("Sinu Käpp", "Muuda profiili"). */
export interface ProfileService {
  getOwnProfile(userId: string): Promise<Profile>;
  updateOwnProfile(userId: string, patch: UpdateProfileInput): Promise<Profile>;
}

export function createProfileService({
  repository,
  timeoutMs,
}: {
  repository: ProfileRepository;
  timeoutMs: number;
}): ProfileService {
  return {
    async getOwnProfile(userId) {
      const profile = await withTimeout(repository.findById(userId), timeoutMs, 'profile.findById');
      // A valid session for a deleted user (race with account deletion) — treat as gone.
      if (!profile) throw new NotFoundError('Kasutajat ei leitud');
      return profile;
    },

    async updateOwnProfile(userId, patch) {
      const profile = await withTimeout(repository.update(userId, patch), timeoutMs, 'profile.update');
      if (!profile) throw new NotFoundError('Kasutajat ei leitud');
      return profile;
    },
  };
}
