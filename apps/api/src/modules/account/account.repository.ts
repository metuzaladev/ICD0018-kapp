import type { AccountExport, Language, LegalAcceptance } from '@kapp/shared';
import { eq, sql } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { user } from '../../db/schema';

/** What deletion needs to know about the account before it is gone. */
export interface AccountOwner {
  email: string;
  name: string;
  language: Language;
  emailVerified: boolean;
  /** An email + password login exists (Better Auth `credential` account). */
  hasPassword: boolean;
}

/** Collected inside the deletion transaction, acted on after the commit. */
export interface DeletedAccount {
  storageKeys: string[];
  storagePrefixes: string[];
  /** Future confirmed bookings that were cancelled: their reminder jobs are removed. */
  cancelledBookingIds: string[];
}

export interface AccountRepository {
  findOwner(userId: string): Promise<AccountOwner | null>;
  /** Everything in one transaction; null when the user no longer exists (a concurrent deletion). */
  deleteAccount(userId: string): Promise<DeletedAccount | null>;
  acceptLegal(userId: string, versions: { termsVersion: string; privacyVersion: string }): Promise<LegalAcceptance | null>;
  exportData(userId: string): Promise<AccountExport['sections'] | null>;
}

type Row = Record<string, unknown>;

export function createAccountRepository(db: Db): AccountRepository {
  return {
    async findOwner(userId) {
      const [row] = await db
        .select({
          email: user.email,
          name: user.name,
          language: user.language,
          emailVerified: user.emailVerified,
          hasPassword: sql<boolean>`exists (select 1 from "account" a where a.user_id = "user"."id" and a.provider_id = 'credential' and a.password is not null)`,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      return row ?? null;
    },

    async deleteAccount(userId) {
      return db.transaction(async (tx) => {
        // Lock the account row: two concurrent deletions (double tap, two devices) serialise here and
        // the second one finds nothing instead of racing through the cleanup.
        const locked = await tx.execute<{ email: string }>(sql`select email from "user" where id = ${userId} for update`);
        const email = locked.rows[0]?.email;
        if (email === undefined) return null;

        // 1. Files to delete after the commit (rows first, objects later — docs/06). Exact keys plus
        //    the per-dog / per-post prefixes, which also catch objects whose row never got written.
        const keys = await tx.execute<{ key: string | null }>(sql`
          select dp.image_key as key from dog_photos dp join dogs d on d.id = dp.dog_id where d.owner_id = ${userId}
          union all select dp.thumbnail_key from dog_photos dp join dogs d on d.id = dp.dog_id where d.owner_id = ${userId}
          union all select hr.document_key from health_records hr join dogs d on d.id = hr.dog_id where d.owner_id = ${userId}
          union all select pp.image_key from place_post_photos pp join place_posts p on p.id = pp.post_id where p.author_id = ${userId}
          union all select pp.thumbnail_key from place_post_photos pp join place_posts p on p.id = pp.post_id where p.author_id = ${userId}
          union all select pr.photo_key from park_reports pr where pr.user_id = ${userId}`);
        const prefixes = await tx.execute<{ prefix: string }>(sql`
          select 'dogs/' || d.id || '/' as prefix from dogs d where d.owner_id = ${userId}
          union all select 'places/' || p.id || '/' from place_posts p where p.author_id = ${userId}`);

        // 2. Future bookings: cancelled (their reminder jobs are removed after the commit). The rows
        //    then go with the account, which frees the provider's slot for the overlap constraint.
        const cancelled = await tx.execute<{ id: string }>(sql`
          update bookings set status = 'cancelled', cancelled_at = now(), redemption_id = null
          where user_id = ${userId} and status = 'confirmed' and starts_at > now()
          returning id`);

        // 3. Conversations the user is in: those left without members afterwards are removed.
        const conversationIds = (
          await tx.execute<{ id: string }>(sql`select conversation_id as id from conversation_members where user_id = ${userId}`)
        ).rows.map((r) => r.id);

        // 4. Reports the user filed are their writing about others: deleted, not kept anonymously.
        //    (The foreign keys would only set reporter_id null, docs/17.)
        await tx.execute(sql`delete from user_reports where reporter_id = ${userId}`);
        await tx.execute(sql`delete from park_reports where user_id = ${userId}`);
        await tx.execute(sql`delete from place_post_reports where reporter_id = ${userId}`);

        // 5. Better Auth's verification rows are not linked by a foreign key (reset tokens store the
        //    user id as the value, email tokens the address as the identifier).
        await tx.execute(sql`delete from verification where value = ${userId} or identifier = ${email}`);

        // 6. The account. Foreign keys do the rest in this statement: cascade for everything owned
        //    (dogs → photos/health, check-ins, plans, reviews, favourites, friendships, blocks,
        //    notifications, preferences, push tokens, sessions, accounts, place posts → photos/likes/
        //    saves, likes/saves on others' posts, bookings, redemptions, Käpad ledger — its append-only
        //    trigger allows deletes that come from a cascade — balances, milestones, invite codes,
        //    referrals, conversation memberships); set null for messages the user sent (readable for
        //    the other person as "deleted user") and parks the user suggested (public map data).
        await tx.delete(user).where(eq(user.id, userId));

        if (conversationIds.length > 0) {
          await tx.execute(sql`
            delete from conversations c
            where c.id in (${sql.join(conversationIds.map((id) => sql`${id}`), sql`, `)})
              and not exists (select 1 from conversation_members m where m.conversation_id = c.id)`);
        }

        return {
          storageKeys: keys.rows.flatMap((r) => (r.key ? [r.key] : [])),
          storagePrefixes: [...prefixes.rows.map((r) => r.prefix), `uploads/${userId}/`],
          cancelledBookingIds: cancelled.rows.map((r) => r.id),
        };
      });
    },

    async acceptLegal(userId, { termsVersion, privacyVersion }) {
      const [row] = await db
        .update(user)
        .set({ termsVersion, privacyVersion, legalAcceptedAt: new Date() })
        .where(eq(user.id, userId))
        .returning({ termsVersion: user.termsVersion, privacyVersion: user.privacyVersion, acceptedAt: user.legalAcceptedAt });
      return row ? { ...row, acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null } : null;
    },

    async exportData(userId) {
      // Explicit columns everywhere: the export must never include password hashes, session or OAuth
      // tokens, or another person's private data (friends appear by first name and id only).
      const q = async (query: ReturnType<typeof sql>) => (await db.execute<Row>(query)).rows;
      const [account] = await q(sql`
        select id, name, email, email_verified, area, bio, presence_sharing, allow_friend_requests, language,
          terms_version, privacy_version, legal_accepted_at, created_at, updated_at
        from "user" where id = ${userId}`);
      if (!account) return null;

      const [
        logins,
        dogs,
        dogPhotos,
        healthRecords,
        checkIns,
        plans,
        reviews,
        favorites,
        friends,
        messagesSent,
        blocks,
        notificationPreferences,
        pushTokens,
        placePosts,
        likes,
        saves,
        bookings,
        rewards,
        redemptions,
        reportsFiled,
      ] = await Promise.all([
        q(sql`select provider_id, created_at from account where user_id = ${userId} order by created_at`),
        q(sql`select id, name, breed, sex, birth_date, weight_kg, temperament, created_at from dogs where owner_id = ${userId} order by created_at`),
        q(sql`select dp.id, dp.dog_id, dp.caption, dp.created_at from dog_photos dp join dogs d on d.id = dp.dog_id where d.owner_id = ${userId} order by dp.created_at`),
        q(sql`select hr.id, hr.dog_id, hr.kind, hr.title, hr.date, hr.next_due, hr.clinic, hr.notes from health_records hr join dogs d on d.id = hr.dog_id where d.owner_id = ${userId} order by hr.date`),
        q(sql`select c.id, c.park_id, p.name as park_name, c.started_at, c.expires_at, c.ended_at from check_ins c join parks p on p.id = c.park_id where c.user_id = ${userId} order by c.started_at`),
        q(sql`select v.id, v.park_id, p.name as park_name, v.starts_at, v.ends_at, v.note from planned_visits v join parks p on p.id = v.park_id where v.user_id = ${userId} order by v.starts_at`),
        q(sql`select r.park_id, p.name as park_name, r.rating, r.body, r.created_at, r.updated_at from reviews r join parks p on p.id = r.park_id where r.user_id = ${userId}`),
        q(sql`select f.park_id, p.name as park_name, f.created_at from favorite_parks f join parks p on p.id = f.park_id where f.user_id = ${userId}`),
        q(sql`select case when f.requester_id = ${userId} then f.addressee_id else f.requester_id end as user_id,
                split_part(u.name, ' ', 1) as first_name, f.status, f.requester_id = ${userId} as requested_by_me, f.created_at
              from friendships f join "user" u on u.id = case when f.requester_id = ${userId} then f.addressee_id else f.requester_id end
              where f.requester_id = ${userId} or f.addressee_id = ${userId}`),
        q(sql`select id, conversation_id, body, created_at from messages where sender_id = ${userId} order by created_at`),
        q(sql`select blocked_id as user_id, created_at from user_blocks where blocker_id = ${userId}`),
        q(sql`select messages, friend_requests, friend_plans, bookings, rewards, updated_at from notification_preferences where user_id = ${userId}`),
        q(sql`select platform, created_at from push_tokens where user_id = ${userId}`),
        q(sql`select id, name, category, ST_Y(location) as lat, ST_X(location) as lng, address, amenities, body, status, created_at from place_posts where author_id = ${userId} order by created_at`),
        q(sql`select post_id, created_at from place_post_likes where user_id = ${userId}`),
        q(sql`select post_id, created_at from place_post_saves where user_id = ${userId}`),
        q(sql`select b.id, sp.name as provider_name, s.name as service_name, b.starts_at, b.ends_at, b.note, b.price_cents, b.status, b.cancelled_at, b.discount_percent, b.created_at
              from bookings b join service_providers sp on sp.id = b.provider_id join services s on s.id = b.service_id
              where b.user_id = ${userId} order by b.starts_at`),
        q(sql`select delta, reason, day, created_at from reward_ledger where user_id = ${userId} order by created_at`),
        q(sql`select id, offer_type, provider_id, discount_percent, points_cost, status, expires_at, used_at, cancelled_at, created_at from redemptions where user_id = ${userId} order by created_at`),
        q(sql`select 'user' as kind, reason, details as text, status, created_at from user_reports where reporter_id = ${userId}
              union all select 'park', null, description, status, created_at from park_reports where user_id = ${userId}
              union all select 'place_post', reason, details, status, created_at from place_post_reports where reporter_id = ${userId}`),
      ]);

      return {
        account,
        logins,
        dogs,
        dogPhotos,
        healthRecords,
        checkIns,
        plans,
        reviews,
        favorites,
        friends,
        messagesSent,
        blocks,
        notificationPreferences: notificationPreferences[0] ?? null,
        pushTokens,
        placePosts,
        likes,
        saves,
        bookings,
        rewards,
        redemptions,
        reportsFiled,
      };
    },
  };
}
