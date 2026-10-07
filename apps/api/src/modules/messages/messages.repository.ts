import type { Conversation, Message, MessagePage } from '@kapp/shared';
import { and, eq, sql } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { conversationMembers, conversations, messages } from '../../db/schema';
import { firstName } from '../safety/block-sql';

/** The viewer's membership in a conversation and what the service needs to decide about it. */
export interface Membership {
  /** Null when the other member has deleted their account (M10): readable, but nothing can be sent. */
  otherId: string | null;
  /** Someone in the pair has blocked the other: the conversation is hidden (→ 404). */
  blocked: boolean;
  /** Still accepted friends: only then can new messages be sent. */
  friends: boolean;
}

/** Data access for 1:1 conversations and their messages. */
export interface MessagesRepository {
  /** The pair's conversation, created on first use; the unique `direct_key` keeps it to one. */
  findOrCreateDirect(a: string, b: string): Promise<string>;
  findMembership(conversationId: string, userId: string): Promise<Membership | null>;
  /** Inbox, most recent activity first; conversations with blocked users are left out. */
  listConversations(userId: string, conversationId?: string): Promise<Conversation[]>;
  /** Newest first, keyset paging on (created_at, id) before the message `before`. */
  listMessages(conversationId: string, before: string | undefined, limit: number): Promise<MessagePage>;
  /** Stores the message and marks the conversation read for the sender. */
  createMessage(conversationId: string, senderId: string, body: string): Promise<Message>;
  markRead(conversationId: string, userId: string): Promise<void>;
}

const directKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

const toMessage = (r: { id: string; conversationId: string; senderId: string | null; body: string; createdAt: Date | string }): Message => ({
  id: r.id,
  conversationId: r.conversationId,
  senderId: r.senderId,
  body: r.body,
  createdAt: new Date(r.createdAt).toISOString(),
});

export function createMessagesRepository(db: Db): MessagesRepository {
  return {
    async findOrCreateDirect(a, b) {
      const key = directKey(a, b);
      return db.transaction(async (tx) => {
        // `on conflict do nothing` + re-read: two friends opening the chat at the same moment both
        // end up in the same conversation instead of one of them getting an error.
        const [created] = await tx
          .insert(conversations)
          .values({ directKey: key })
          .onConflictDoNothing({ target: conversations.directKey })
          .returning({ id: conversations.id });
        if (created) {
          await tx.insert(conversationMembers).values([
            { conversationId: created.id, userId: a },
            { conversationId: created.id, userId: b },
          ]);
          return created.id;
        }
        const [existing] = await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.directKey, key));
        return existing!.id;
      });
    },

    async findMembership(conversationId, userId) {
      // `left join`: after the other member deleted their account (M10) the row is gone, but the
      // remaining member can still read the history (other_id null, never "blocked" or "friends").
      const { rows } = await db.execute<{ other_id: string | null; blocked: boolean; friends: boolean }>(sql`
        select o.user_id as other_id,
          exists (select 1 from user_blocks ub
                  where (ub.blocker_id = ${userId} and ub.blocked_id = o.user_id)
                     or (ub.blocker_id = o.user_id and ub.blocked_id = ${userId})) as blocked,
          exists (select 1 from friendships f where f.status = 'accepted'
                  and ((f.requester_id = ${userId} and f.addressee_id = o.user_id)
                    or (f.requester_id = o.user_id and f.addressee_id = ${userId}))) as friends
        from conversation_members me
        left join conversation_members o on o.conversation_id = me.conversation_id and o.user_id <> me.user_id
        where me.conversation_id = ${conversationId} and me.user_id = ${userId}
        limit 1`);
      const row = rows[0];
      return row ? { otherId: row.other_id, blocked: row.blocked, friends: row.friends } : null;
    },

    async listConversations(userId, conversationId) {
      const only = conversationId ? sql`and me.conversation_id = ${conversationId}` : sql``;
      const { rows } = await db.execute<{
        id: string;
        other_id: string | null;
        other_name: string | null;
        dog_names: string[];
        last_id: string | null;
        last_sender: string | null;
        last_body: string | null;
        last_at: Date | null;
        unread: number;
        friends: boolean;
      }>(sql`
        select c.id, u.id as other_id, u.name as other_name,
          coalesce((select array_agg(d.name order by d.name) from dogs d where d.owner_id = u.id), '{}') as dog_names,
          lm.id as last_id, lm.sender_id as last_sender, lm.body as last_body, lm.created_at as last_at,
          (select count(*)::int from messages m
            where m.conversation_id = c.id and m.sender_id is distinct from ${userId}
              and (me.last_read_at is null or m.created_at > me.last_read_at)) as unread,
          exists (select 1 from friendships f where f.status = 'accepted'
                  and ((f.requester_id = ${userId} and f.addressee_id = u.id)
                    or (f.requester_id = u.id and f.addressee_id = ${userId}))) as friends
        from conversation_members me
        join conversations c on c.id = me.conversation_id
        -- left joins: a deleted account (M10) leaves the conversation with one member and u.* null.
        left join conversation_members o on o.conversation_id = c.id and o.user_id <> me.user_id
        left join "user" u on u.id = o.user_id
        left join lateral (
          select m.id, m.sender_id, m.body, m.created_at from messages m
          where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1
        ) lm on true
        where me.user_id = ${userId} ${only}
          and not exists (select 1 from user_blocks ub
                          where (ub.blocker_id = ${userId} and ub.blocked_id = u.id)
                             or (ub.blocker_id = u.id and ub.blocked_id = ${userId}))
        order by coalesce(lm.created_at, c.created_at) desc
        limit 100`);
      return rows.map((r) => ({
        id: r.id,
        other: r.other_id && r.other_name !== null ? { id: r.other_id, firstName: firstName(r.other_name), dogNames: r.dog_names ?? [] } : null,
        lastMessage:
          r.last_id && r.last_body !== null && r.last_at
            ? toMessage({ id: r.last_id, conversationId: r.id, senderId: r.last_sender, body: r.last_body, createdAt: r.last_at })
            : null,
        unreadCount: r.unread,
        canMessage: r.friends,
      }));
    },

    async listMessages(conversationId, before, limit) {
      const cursor = before
        ? sql`and (m.created_at, m.id) < (select m2.created_at, m2.id from messages m2 where m2.id = ${before} and m2.conversation_id = ${conversationId})`
        : sql``;
      const { rows } = await db.execute<{ id: string; conversation_id: string; sender_id: string | null; body: string; created_at: Date }>(sql`
        select m.id, m.conversation_id, m.sender_id, m.body, m.created_at from messages m
        where m.conversation_id = ${conversationId} ${cursor}
        order by m.created_at desc, m.id desc
        limit ${limit + 1}`);
      const page = rows.slice(0, limit).map((r) =>
        toMessage({ id: r.id, conversationId: r.conversation_id, senderId: r.sender_id, body: r.body, createdAt: r.created_at }),
      );
      return { messages: page, nextCursor: rows.length > limit ? page[page.length - 1]!.id : null };
    },

    async createMessage(conversationId, senderId, body) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(messages)
          .values({ conversationId, senderId, body })
          .returning({ id: messages.id, conversationId: messages.conversationId, senderId: messages.senderId, body: messages.body, createdAt: messages.createdAt });
        await tx
          .update(conversationMembers)
          .set({ lastReadAt: row!.createdAt })
          .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, senderId)));
        await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
        return toMessage(row!);
      });
    },

    async markRead(conversationId, userId) {
      await db
        .update(conversationMembers)
        .set({ lastReadAt: sql`now()` })
        .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
    },
  };
}
