import type { Profile, UpdateProfileInput } from '@kapp/shared';
import { eq } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { user } from '../../db/schema';

/** Data access for the signed-in user's own profile (table `user`, owned jointly with Better Auth). */
export interface ProfileRepository {
  findById(userId: string): Promise<Profile | null>;
  update(userId: string, patch: UpdateProfileInput): Promise<Profile | null>;
}

// Explicit column list: never `select *` on the user table, so future sensitive columns
// cannot leak through this endpoint by accident.
const columns = {
  id: user.id,
  name: user.name,
  email: user.email,
  image: user.image,
  area: user.area,
  bio: user.bio,
  presenceSharing: user.presenceSharing,
  allowFriendRequests: user.allowFriendRequests,
  language: user.language,
};

export function createProfileRepository(db: Db): ProfileRepository {
  return {
    async findById(userId) {
      const [row] = await db.select(columns).from(user).where(eq(user.id, userId)).limit(1);
      return row ?? null;
    },

    async update(userId, patch) {
      // Drop undefined keys: undefined means "leave unchanged", null means "clear".
      const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      const [row] = await db.update(user).set(values).where(eq(user.id, userId)).returning(columns);
      return row ?? null;
    },
  };
}
