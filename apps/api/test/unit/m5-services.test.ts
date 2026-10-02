import type { AppNotification, PlannedVisit } from '@kapp/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BadRequestError, ForbiddenError, NotFoundError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import { createFriendsService } from '../../src/modules/friends/friends.service';
import { createMessagesService } from '../../src/modules/messages/messages.service';
import { createNotificationsService } from '../../src/modules/notifications/notifications.service';
import { createNotifier, type Notifier } from '../../src/modules/notifications/notifier';
import { composePush, formatPlanWindow, preview } from '../../src/modules/notifications/push-messages';
import { createSafetyService } from '../../src/modules/safety/safety.service';
import {
  mockFriendsRepository,
  mockMessagesRepository,
  mockNotificationsRepository,
  mockPushTokensRepository,
  mockSafetyRepository,
  USER_ID,
} from '../helpers';

const OTHER = 'user_other';
const CONV = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const uniqueViolation = Object.assign(new Error('duplicate'), { code: '23505', constraint: 'friendships_pair_uq' });

afterEach(() => vi.useRealTimers());

const mockNotifier = () => ({ notify: vi.fn().mockResolvedValue(undefined) }) satisfies Notifier;

function friendsSetup() {
  const repository = mockFriendsRepository();
  const notifier = mockNotifier();
  const service = createFriendsService({ repository, notifier, timeoutMs: 1000 });
  return { repository, notifier, service };
}

const row = (requesterId: string, addresseeId: string, status: 'pending' | 'accepted') => ({
  requesterId,
  addresseeId,
  status,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('friends service: requests', () => {
  it('creates a request and notifies the addressee', async () => {
    const { repository, notifier, service } = friendsSetup();
    repository.findTarget.mockResolvedValue({ id: OTHER, allowFriendRequests: true });
    repository.findFriendship.mockResolvedValue(null);
    repository.createRequest.mockResolvedValue(undefined);
    await expect(service.sendRequest(USER_ID, OTHER)).resolves.toEqual({ result: { status: 'pending' }, created: true });
    expect(notifier.notify).toHaveBeenCalledWith({ type: 'friend_request', recipientId: OTHER, actorId: USER_ID, data: {} });
  });

  it('refuses yourself (400), a missing or blocked user (404) and disabled requests (403)', async () => {
    const { repository, service } = friendsSetup();
    await expect(service.sendRequest(USER_ID, USER_ID)).rejects.toBeInstanceOf(BadRequestError);
    repository.findTarget.mockResolvedValueOnce(null);
    await expect(service.sendRequest(USER_ID, OTHER)).rejects.toMatchObject({ statusCode: 404, key: 'errors.userNotFound' });
    repository.findTarget.mockResolvedValueOnce({ id: OTHER, allowFriendRequests: false });
    repository.findFriendship.mockResolvedValueOnce(null);
    await expect(service.sendRequest(USER_ID, OTHER)).rejects.toMatchObject({ statusCode: 403, key: 'errors.friendRequestsDisabled' });
    expect(repository.createRequest).not.toHaveBeenCalled();
  });

  it('asking again is idempotent; asking someone who asked you accepts', async () => {
    const { repository, notifier, service } = friendsSetup();
    repository.findTarget.mockResolvedValue({ id: OTHER, allowFriendRequests: false });
    repository.findFriendship.mockResolvedValueOnce(row(USER_ID, OTHER, 'pending'));
    await expect(service.sendRequest(USER_ID, OTHER)).resolves.toEqual({ result: { status: 'pending' }, created: false });
    repository.findFriendship.mockResolvedValueOnce(row(OTHER, USER_ID, 'pending'));
    repository.accept.mockResolvedValueOnce(true);
    await expect(service.sendRequest(USER_ID, OTHER)).resolves.toEqual({ result: { status: 'accepted' }, created: false });
    expect(repository.accept).toHaveBeenCalledWith(OTHER, USER_ID);
    expect(notifier.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'friend_accepted', recipientId: OTHER }));
  });

  it('a simultaneous reverse request (unique violation) ends as accepted', async () => {
    const { repository, service } = friendsSetup();
    repository.findTarget.mockResolvedValue({ id: OTHER, allowFriendRequests: true });
    repository.findFriendship.mockResolvedValueOnce(null).mockResolvedValueOnce(row(OTHER, USER_ID, 'pending'));
    repository.createRequest.mockRejectedValue(uniqueViolation);
    repository.accept.mockResolvedValue(true);
    await expect(service.sendRequest(USER_ID, OTHER)).resolves.toEqual({ result: { status: 'accepted' }, created: false });
  });

  it('accept: notifies the requester; twice is fine; no request is 404', async () => {
    const { repository, notifier, service } = friendsSetup();
    repository.accept.mockResolvedValueOnce(true);
    await service.acceptRequest(USER_ID, OTHER);
    expect(notifier.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'friend_accepted', recipientId: OTHER, actorId: USER_ID }));
    repository.accept.mockResolvedValue(false);
    repository.findFriendship.mockResolvedValueOnce(row(OTHER, USER_ID, 'accepted'));
    await expect(service.acceptRequest(USER_ID, OTHER)).resolves.toBeUndefined();
    repository.findFriendship.mockResolvedValueOnce(null);
    await expect(service.acceptRequest(USER_ID, OTHER)).rejects.toMatchObject({ statusCode: 404, key: 'errors.friendRequestNotFound' });
  });

  it('profile of a missing or blocked user is 404', async () => {
    const { repository, service } = friendsSetup();
    repository.profile.mockResolvedValue(null);
    await expect(service.getProfile(USER_ID, OTHER)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('announcePlan notifies each friend in the audience and never throws', async () => {
    const { repository, notifier, service } = friendsSetup();
    const plan: PlannedVisit = {
      id: '0b0e3f5c-1111-4222-8333-944455556666',
      park: { id: '4ddabe8d-7306-4724-a125-ace7ae3a87b9', name: 'Kadriorg' },
      startsAt: '2026-10-02T14:00:00.000Z',
      endsAt: '2026-10-02T15:00:00.000Z',
      note: null,
    };
    repository.planAudience.mockResolvedValueOnce(['a', 'b']);
    await service.announcePlan(USER_ID, plan);
    expect(notifier.notify).toHaveBeenCalledTimes(2);
    expect(notifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'friend_plan', recipientId: 'b', data: expect.objectContaining({ parkName: 'Kadriorg' }) }),
    );
    repository.planAudience.mockRejectedValueOnce(new Error('db down'));
    await expect(service.announcePlan(USER_ID, plan)).resolves.toBeUndefined();
  });

  it('a hanging repository becomes a TimeoutError (expectation attached before advancing timers)', async () => {
    vi.useFakeTimers();
    const { repository, service } = friendsSetup();
    repository.listFriends.mockReturnValue(new Promise(() => {}));
    const pending = expect(service.listFriends(USER_ID)).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(1001);
    await pending;
  });
});

function messagesSetup() {
  const messages = mockMessagesRepository();
  const friends = mockFriendsRepository();
  const notifications = mockNotificationsRepository();
  const notifier = mockNotifier();
  const realtime = { emitToUsers: vi.fn() };
  const service = createMessagesService({ messages, friends, notifications, notifier, realtime, timeoutMs: 1000 });
  return { messages, friends, notifications, notifier, realtime, service };
}

const message = { id: '1a2b3c4d-1111-4222-8333-944455556666', conversationId: CONV, senderId: USER_ID, body: 'Tere!', createdAt: '2026-10-02T10:00:00.000Z' };

describe('messages service', () => {
  it('start: only between friends; blocked or missing is 404', async () => {
    const { messages, friends, service } = messagesSetup();
    friends.findTarget.mockResolvedValueOnce(null);
    await expect(service.startConversation(USER_ID, OTHER)).rejects.toMatchObject({ statusCode: 404 });
    friends.findTarget.mockResolvedValue({ id: OTHER, allowFriendRequests: true });
    friends.findFriendship.mockResolvedValueOnce(row(USER_ID, OTHER, 'pending'));
    await expect(service.startConversation(USER_ID, OTHER)).rejects.toMatchObject({ statusCode: 403, key: 'errors.messagesFriendsOnly' });
    friends.findFriendship.mockResolvedValueOnce(row(USER_ID, OTHER, 'accepted'));
    messages.findOrCreateDirect.mockResolvedValue(CONV);
    messages.listConversations.mockResolvedValue([{ id: CONV }]);
    await expect(service.startConversation(USER_ID, OTHER)).resolves.toEqual({ id: CONV });
  });

  it('send: emits to both members and notifies the recipient with a preview', async () => {
    const { messages, notifier, realtime, service } = messagesSetup();
    messages.findMembership.mockResolvedValue({ otherId: OTHER, blocked: false, friends: true });
    messages.createMessage.mockResolvedValue(message);
    await expect(service.sendMessage(USER_ID, CONV, 'Tere!')).resolves.toEqual(message);
    expect(realtime.emitToUsers).toHaveBeenCalledWith([USER_ID, OTHER], 'message:new', message);
    expect(notifier.notify).toHaveBeenCalledWith({
      type: 'message',
      recipientId: OTHER,
      actorId: USER_ID,
      data: { conversationId: CONV, preview: 'Tere!' },
    });
  });

  it('send: not a member or blocked → 404, no longer friends → 403', async () => {
    const { messages, service } = messagesSetup();
    messages.findMembership.mockResolvedValueOnce(null);
    await expect(service.sendMessage(USER_ID, CONV, 'x')).rejects.toMatchObject({ statusCode: 404, key: 'errors.conversationNotFound' });
    messages.findMembership.mockResolvedValueOnce({ otherId: OTHER, blocked: true, friends: true });
    await expect(service.sendMessage(USER_ID, CONV, 'x')).rejects.toMatchObject({ statusCode: 404 });
    messages.findMembership.mockResolvedValueOnce({ otherId: OTHER, blocked: false, friends: false });
    await expect(service.sendMessage(USER_ID, CONV, 'x')).rejects.toBeInstanceOf(ForbiddenError);
    expect(messages.createMessage).not.toHaveBeenCalled();
  });

  it('history stays readable after unfriending; markRead clears the message notification', async () => {
    const { messages, notifications, service } = messagesSetup();
    messages.findMembership.mockResolvedValue({ otherId: OTHER, blocked: false, friends: false });
    messages.listMessages.mockResolvedValue({ messages: [message], nextCursor: null });
    await expect(service.listMessages(USER_ID, CONV, { limit: 30 })).resolves.toMatchObject({ nextCursor: null });
    await service.markRead(USER_ID, CONV);
    expect(messages.markRead).toHaveBeenCalledWith(CONV, USER_ID);
    expect(notifications.markConversationRead).toHaveBeenCalledWith(USER_ID, CONV);
  });

  it('a hanging send becomes a TimeoutError', async () => {
    vi.useFakeTimers();
    const { messages, service } = messagesSetup();
    messages.findMembership.mockResolvedValue({ otherId: OTHER, blocked: false, friends: true });
    messages.createMessage.mockReturnValue(new Promise(() => {}));
    const pending = expect(service.sendMessage(USER_ID, CONV, 'x')).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(1001);
    await pending;
  });
});

describe('safety service', () => {
  const setup = () => {
    const repository = mockSafetyRepository();
    return { repository, service: createSafetyService({ repository, timeoutMs: 1000 }) };
  };

  it('block: self is 400, unknown user 404, otherwise blocks', async () => {
    const { repository, service } = setup();
    await expect(service.block(USER_ID, USER_ID)).rejects.toMatchObject({ statusCode: 400, key: 'errors.cannotBlockSelf' });
    repository.userExists.mockResolvedValueOnce(false);
    await expect(service.block(USER_ID, OTHER)).rejects.toMatchObject({ statusCode: 404 });
    repository.userExists.mockResolvedValueOnce(true);
    await service.block(USER_ID, OTHER);
    expect(repository.block).toHaveBeenCalledWith(USER_ID, OTHER);
  });

  it('unblock is idempotent and needs no existence check', async () => {
    const { repository, service } = setup();
    await service.unblock(USER_ID, OTHER);
    expect(repository.userExists).not.toHaveBeenCalled();
    expect(repository.unblock).toHaveBeenCalledWith(USER_ID, OTHER);
  });

  it('report: stores reason and details; self is 400', async () => {
    const { repository, service } = setup();
    await expect(service.reportUser(USER_ID, USER_ID, { reason: 'spam', details: null })).rejects.toMatchObject({ key: 'errors.cannotReportSelf' });
    repository.userExists.mockResolvedValue(true);
    repository.createReport.mockResolvedValue({ id: 'r1' });
    await expect(service.reportUser(USER_ID, OTHER, { reason: 'harassment', details: 'Solvavad sõnumid' })).resolves.toEqual({ id: 'r1' });
    expect(repository.createReport).toHaveBeenCalledWith({ reporterId: USER_ID, reportedId: OTHER, reason: 'harassment', details: 'Solvavad sõnumid' });
  });
});

describe('notifications service', () => {
  const setup = () => {
    const notifications = mockNotificationsRepository();
    const tokens = mockPushTokensRepository();
    return { notifications, tokens, service: createNotificationsService({ notifications, tokens, timeoutMs: 1000 }) };
  };

  it('markRead on someone else’s notification is 404', async () => {
    const { notifications, service } = setup();
    notifications.markRead.mockResolvedValue(false);
    await expect(service.markRead(USER_ID, CONV)).rejects.toMatchObject({ statusCode: 404, key: 'errors.notificationNotFound' });
  });

  it('registers a push token together with the app language', async () => {
    const { tokens, service } = setup();
    await service.registerPushToken(USER_ID, { token: 'ExponentPushToken[abcdefghijkl]', platform: 'ios', language: 'ru' });
    expect(tokens.upsert).toHaveBeenCalledWith({ userId: USER_ID, token: 'ExponentPushToken[abcdefghijkl]', platform: 'ios', language: 'ru' });
  });
});

const notification = (overrides: Partial<AppNotification> = {}): AppNotification => ({
  id: '7d8e9f00-1111-4222-8333-944455556666',
  type: 'message',
  actor: { id: USER_ID, firstName: 'Mari' },
  data: { conversationId: CONV, preview: 'Sobib!' },
  readAt: null,
  createdAt: '2026-10-02T10:00:00.000Z',
  ...overrides,
});

describe('notifier', () => {
  const setup = (language: 'et' | 'en' | 'ru' = 'ru', messagesOn = true) => {
    const notifications = mockNotificationsRepository();
    notifications.upsertMessageNotification.mockResolvedValue(notification());
    notifications.create.mockResolvedValue(notification({ type: 'friend_request', data: {} }));
    notifications.unreadCount.mockResolvedValue(3);
    notifications.pushContext.mockResolvedValue({ language, preferences: { messages: messagesOn, friendRequests: true, friendPlans: true } });
    const realtime = { emitToUsers: vi.fn() };
    const pushQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const log = { warn: vi.fn() };
    const notifier = createNotifier({ notifications, realtime, pushQueue, log, timeoutMs: 1000 });
    return { notifications, realtime, pushQueue, log, notifier };
  };
  const event = { type: 'message' as const, recipientId: OTHER, actorId: USER_ID, data: { conversationId: CONV, preview: 'Sobib!' } };

  it('stores one row per conversation, emits the unread count and enqueues a push in the recipient’s language', async () => {
    const { notifications, realtime, pushQueue, notifier } = setup('ru');
    await notifier.notify(event);
    expect(notifications.upsertMessageNotification).toHaveBeenCalled();
    expect(realtime.emitToUsers).toHaveBeenCalledWith([OTHER], 'notification:new', expect.objectContaining({ unreadCount: 3 }));
    expect(pushQueue.enqueue).toHaveBeenCalledWith({
      userId: OTHER,
      language: 'ru',
      title: 'Сообщение от Mari',
      body: 'Sobib!',
      data: expect.objectContaining({ type: 'message', conversationId: CONV }),
    });
  });

  it('respects the preference: no push, but the feed row and realtime event still happen', async () => {
    const { notifications, realtime, pushQueue, notifier } = setup('et', false);
    await notifier.notify(event);
    expect(notifications.upsertMessageNotification).toHaveBeenCalled();
    expect(realtime.emitToUsers).toHaveBeenCalled();
    expect(pushQueue.enqueue).not.toHaveBeenCalled();
  });

  it('never throws: a failing queue is logged', async () => {
    const { pushQueue, log, notifier } = setup();
    pushQueue.enqueue.mockRejectedValue(new Error('redis down'));
    await expect(notifier.notify(event)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ type: 'message' }), 'notification not delivered');
  });

  it('a hanging Redis is cut off after 2 s (expectation attached before advancing timers)', async () => {
    vi.useFakeTimers();
    const { pushQueue, log, notifier } = setup();
    pushQueue.enqueue.mockReturnValue(new Promise(() => {}));
    const pending = expect(notifier.notify(event)).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(2001);
    await pending;
    expect(log.warn.mock.calls[0]![0].err).toBeInstanceOf(TimeoutError);
  });
});

describe('push texts', () => {
  it('are localised per language', () => {
    expect(composePush('et', 'friend_request', 'Liis', {})).toEqual({ title: 'Uus sõbrakutse', body: 'Liis tahab sinuga sõbraks saada' });
    expect(composePush('en', 'friend_accepted', 'Liis', {}).body).toBe('Liis accepted your friend request');
    expect(composePush('ru', 'message', 'Мари', { preview: 'Привет' })).toEqual({ title: 'Сообщение от Мари', body: 'Привет' });
  });

  it('show plan times in Tallinn time with the Estonian dot', () => {
    // 14:00Z = 17:00 in Tallinn (EEST, UTC+3) on 2 October 2026 (a Friday).
    expect(formatPlanWindow('et', '2026-10-02T14:00:00.000Z', '2026-10-02T15:00:00.000Z')).toMatch(/17\.00–18\.00$/);
    expect(formatPlanWindow('en', '2026-10-02T14:00:00.000Z', '2026-10-02T15:00:00.000Z')).toBe('Fri 17:00–18:00');
    const plan = composePush('et', 'friend_plan', 'Mari', {
      parkName: 'Kadrioru koerapark',
      startsAt: '2026-10-02T14:00:00.000Z',
      endsAt: '2026-10-02T15:00:00.000Z',
    });
    expect(plan.title).toBe('Mari läheb parki');
    expect(plan.body).toMatch(/^Kadrioru koerapark · .+ 17\.00–18\.00$/);
  });

  it('previews are cut to 120 characters', () => {
    expect(preview('a'.repeat(300))).toHaveLength(120);
    expect(preview('lühike')).toBe('lühike');
  });
});
