import type { Profile, UpdateProfileInput } from '@kapp/shared';
import { eq, sql } from 'drizzle-orm';

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
  emailVerified: user.emailVerified,
  termsVersion: user.termsVersion,
  privacyVersion: user.privacyVersion,
  legalAcceptedAt: user.legalAcceptedAt,
  // M10: decides how deletion is confirmed (password vs. a fresh sign-in). The outer row is named
  // explicitly — an unqualified "id" would bind to account.id inside the subquery (docs/06).
  hasPassword: sql<boolean>`exists (select 1 from "account" a where a.user_id = "user"."id" and a.provider_id = 'credential' and a.password is not null)`,
};

type Row = Omit<Profile, 'legal'> & { termsVersion: string | null; privacyVersion: string | null; legalAcceptedAt: Date | null };

function toProfile({ termsVersion, privacyVersion, legalAcceptedAt, ...rest }: Row): Profile {
  return { ...rest, legal: { termsVersion, privacyVersion, acceptedAt: legalAcceptedAt ? legalAcceptedAt.toISOString() : null } };
}

export function createProfileRepository(db: Db): ProfileRepository {
  return {
    async findById(userId) {
      const [row] = await db.select(columns).from(user).where(eq(user.id, userId)).limit(1);
      return row ? toProfile(row) : null;
    },

    async update(userId, patch) {
      // Drop undefined keys: undefined means "leave unchanged", null means "clear".
      const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      const [row] = await db.update(user).set(values).where(eq(user.id, userId)).returning(columns);
      return row ? toProfile(row) : null;
    },
  };
}
