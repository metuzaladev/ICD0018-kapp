import type { Conversation, Message, MessagePage, MessagesQuery } from '@kapp/shared';

import { ForbiddenError, NotFoundError } from '../../http/errors';
import { withTimeout } from '../../lib/timeout';
import type { RealtimeGateway } from '../../realtime/socket-gateway';
import type { FriendsRepository } from '../friends/friends.repository';
import type { NotificationsRepository } from '../notifications/notifications.repository';
import type { Notifier } from '../notifications/notifier';
import { preview } from '../notifications/push-messages';
import type { MessagesRepository } from './messages.repository';

/**
 * 1:1 messages between friends (M5). Only friends can start a conversation or send a message
 * (anti-spam); a conversation with someone either side has blocked is hidden (404). After a
 * friendship ends the history stays readable but new messages are refused (403).
 */
export interface MessagesService {
  startConversation(userId: string, otherId: string): Promise<Conversation>;
  listConversations(userId: string): Promise<Conversation[]>;
  getConversation(userId: string, conversationId: string): Promise<Conversation>;
  listMessages(userId: string, conversationId: string, query: MessagesQuery): Promise<MessagePage>;
  sendMessage(userId: string, conversationId: string, body: string): Promise<Message>;
  markRead(userId: string, conversationId: string): Promise<void>;
}

export function createMessagesService({
  messages,
  friends,
  notifications,
  notifier,
  realtime,
  timeoutMs,
}: {
  messages: MessagesRepository;
  friends: Pick<FriendsRepository, 'findTarget' | 'findFriendship'>;
  notifications: Pick<NotificationsRepository, 'markConversationRead'>;
  notifier: Notifier;
  realtime: RealtimeGateway;
  timeoutMs: number;
}): MessagesService {
  const t = <T>(p: Promise<T>, label: string) => withTimeout(p, timeoutMs, label);

  /** Members only, and never across a block: same 404 for "no such id" and "not yours". */
  async function requireMember(userId: string, conversationId: string) {
    const membership = await t(messages.findMembership(conversationId, userId), 'messages.findMembership');
    if (!membership || membership.blocked) throw new NotFoundError('errors.conversationNotFound');
    return membership;
  }

  async function getConversation(userId: string, conversationId: string) {
    const [conversation] = await t(messages.listConversations(userId, conversationId), 'messages.getConversation');
    if (!conversation) throw new NotFoundError('errors.conversationNotFound');
    return conversation;
  }

  return {
    async startConversation(userId, otherId) {
      if (userId === otherId) throw new ForbiddenError('errors.messagesFriendsOnly');
      const other = await t(friends.findTarget(userId, otherId), 'friends.findTarget');
      if (!other) throw new NotFoundError('errors.userNotFound');
      const friendship = await t(friends.findFriendship(userId, otherId), 'friends.findFriendship');
      if (friendship?.status !== 'accepted') throw new ForbiddenError('errors.messagesFriendsOnly');
      const id = await t(messages.findOrCreateDirect(userId, otherId), 'messages.findOrCreateDirect');
      return getConversation(userId, id);
    },

    listConversations: (userId) => t(messages.listConversations(userId), 'messages.listConversations'),

    getConversation,

    async listMessages(userId, conversationId, { before, limit }) {
      await requireMember(userId, conversationId);
      return t(messages.listMessages(conversationId, before, limit), 'messages.listMessages');
    },

    async sendMessage(userId, conversationId, body) {
      const { otherId, friends: areFriends } = await requireMember(userId, conversationId);
      if (!areFriends) throw new ForbiddenError('errors.messagesFriendsOnly');
      const message = await t(messages.createMessage(conversationId, userId, body), 'messages.createMessage');
      // Both members: the recipient sees it arrive, the sender's other devices stay in sync.
      realtime.emitToUsers([userId, otherId], 'message:new', message);
      await notifier.notify({ type: 'message', recipientId: otherId, actorId: userId, data: { conversationId, preview: preview(body) } });
      return message;
    },

    async markRead(userId, conversationId) {
      await requireMember(userId, conversationId);
      await t(messages.markRead(conversationId, userId), 'messages.markRead');
      await t(notifications.markConversationRead(userId, conversationId), 'notifications.markConversationRead');
    },
  };
}
