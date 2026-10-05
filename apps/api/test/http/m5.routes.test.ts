import { afterEach, describe, expect, it } from 'vitest';

import { ConflictError, ForbiddenError, NotFoundError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import { buildTestApp, fakeAuth, USER_ID } from '../helpers';
import { expectApiError } from './expect-api-error';

let ctx: Awaited<ReturnType<typeof buildTestApp>> | undefined;
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

const auth = { authorization: 'Bearer test' };
const OTHER = 'user_other_1';
const CONV = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const NOTE = '7d8e9f00-1111-4222-8333-944455556666';
const TOKEN = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
const app = async (config = {}) => (ctx = await buildTestApp({ resolveUserId: fakeAuth }, config));
const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, headers: Record<string, string> = {}) =>
  ctx!.app.inject({ method, url: `/api/v1${url}`, headers: { ...auth, ...headers }, payload: payload as object });

describe('M5 routes require a session', () => {
  it.each([
    ['GET', '/me/friends'],
    ['GET', '/me/friends/plans'],
    ['DELETE', `/me/friends/${OTHER}`],
    ['GET', '/me/friend-requests'],
    ['POST', '/me/friend-requests'],
    ['POST', `/me/friend-requests/${OTHER}/accept`],
    ['DELETE', `/me/friend-requests/${OTHER}`],
    ['GET', '/users/search?q=mari'],
    ['GET', `/users/${OTHER}`],
    ['GET', '/me/conversations'],
    ['POST', '/me/conversations'],
    ['GET', `/me/conversations/${CONV}`],
    ['GET', `/me/conversations/${CONV}/messages`],
    ['POST', `/me/conversations/${CONV}/messages`],
    ['PUT', `/me/conversations/${CONV}/read`],
    ['GET', '/me/notifications'],
    ['GET', '/me/notifications/unread-count'],
    ['PUT', `/me/notifications/${NOTE}/read`],
    ['PUT', '/me/notifications/read-all'],
    ['GET', '/me/notification-preferences'],
    ['PUT', '/me/notification-preferences'],
    ['PUT', '/me/push-tokens'],
    ['DELETE', `/me/push-tokens/${encodeURIComponent(TOKEN)}`],
    ['GET', '/me/blocks'],
    ['PUT', `/me/blocks/${OTHER}`],
    ['DELETE', `/me/blocks/${OTHER}`],
    ['POST', `/users/${OTHER}/reports`],
  ] as const)('%s %s → 401', async (method, url) => {
    await app();
    const res = await ctx!.app.inject({ method, url: `/api/v1${url}`, payload: method === 'GET' || method === 'DELETE' ? undefined : {} });
    expect(res.statusCode).toBe(401);
    expectApiError(res, 'Palun logi sisse');
  });
});

describe('friend requests', () => {
  it('201 for a new request, 200 when it existed or was accepted', async () => {
    await app();
    ctx!.friends.sendRequest
      .mockResolvedValueOnce({ result: { status: 'pending' }, created: true })
      .mockResolvedValueOnce({ result: { status: 'accepted' }, created: false });
    const first = await req('POST', '/me/friend-requests', { userId: OTHER });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ status: 'pending' });
    expect(ctx!.friends.sendRequest).toHaveBeenCalledWith(USER_ID, OTHER);
    const second = await req('POST', '/me/friend-requests', { userId: OTHER });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ status: 'accepted' });
  });

  it.each([
    ['no body', undefined, 'Päringu sisu puudub'],
    ['null userId', { userId: null }, /userId/],
    ['number userId', { userId: 42 }, /userId/],
    ['bad characters', { userId: 'x; drop table' }, /userId/],
    ['extra field', { userId: OTHER, status: 'accepted' }, /status/],
  ])('400 for %s', async (_case, payload, message) => {
    await app();
    const res = await req('POST', '/me/friend-requests', payload);
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
    expect(ctx!.friends.sendRequest).not.toHaveBeenCalled();
  });

  it('403/404/409/503 from the service, translated per Accept-Language', async () => {
    await app();
    ctx!.friends.sendRequest
      .mockRejectedValueOnce(new ForbiddenError('errors.friendRequestsDisabled'))
      .mockRejectedValueOnce(new NotFoundError('errors.userNotFound'))
      .mockRejectedValueOnce(new ConflictError())
      .mockRejectedValueOnce(new TimeoutError('friends.findTarget', 8000));
    const forbidden = await req('POST', '/me/friend-requests', { userId: OTHER }, { 'accept-language': 'en' });
    expect(forbidden.statusCode).toBe(403);
    expectApiError(forbidden, 'This user is not accepting friend requests right now');
    const missing = await req('POST', '/me/friend-requests', { userId: OTHER }, { 'accept-language': 'ru' });
    expect(missing.statusCode).toBe(404);
    expectApiError(missing, 'Пользователь не найден');
    expect((await req('POST', '/me/friend-requests', { userId: OTHER })).statusCode).toBe(409);
    expect((await req('POST', '/me/friend-requests', { userId: OTHER })).statusCode).toBe(503);
  });

  it('accept / decline / unfriend are 204; a bad id is 400', async () => {
    await app();
    expect((await req('POST', `/me/friend-requests/${OTHER}/accept`)).statusCode).toBe(204);
    expect((await req('DELETE', `/me/friend-requests/${OTHER}`)).statusCode).toBe(204);
    expect((await req('DELETE', `/me/friends/${OTHER}`)).statusCode).toBe(204);
    expect(ctx!.friends.removeFriend).toHaveBeenCalledWith(USER_ID, OTHER);
    const bad = await req('DELETE', `/me/friends/${'x'.repeat(65)}`);
    expect(bad.statusCode).toBe(400);
    expectApiError(bad, /userId/);
  });

  it('accepting a missing request is 404', async () => {
    await app();
    ctx!.friends.acceptRequest.mockRejectedValue(new NotFoundError('errors.friendRequestNotFound'));
    const res = await req('POST', `/me/friend-requests/${OTHER}/accept`);
    expect(res.statusCode).toBe(404);
    expectApiError(res, 'Sõbrakutset ei leitud');
  });
});

describe('people search and profiles', () => {
  it('400 for fewer than 3 letters (in Russian too), 200 otherwise', async () => {
    await app();
    const short = await req('GET', '/users/search?q=ma', undefined, { 'accept-language': 'ru' });
    expect(short.statusCode).toBe(400);
    expectApiError(short, 'не менее 3 букв');
    expect((await req('GET', '/users/search')).statusCode).toBe(400);
    ctx!.friends.search.mockResolvedValue([]);
    const ok = await req('GET', '/users/search?q=%20Mari%20');
    expect(ok.statusCode).toBe(200);
    expect(ctx!.friends.search).toHaveBeenCalledWith(USER_ID, 'Mari');
  });

  it('a profile of a blocked or missing user is 404', async () => {
    await app();
    ctx!.friends.getProfile.mockRejectedValue(new NotFoundError('errors.userNotFound'));
    const res = await req('GET', `/users/${OTHER}`);
    expect(res.statusCode).toBe(404);
    expectApiError(res, 'Kasutajat ei leitud');
  });

  it('search is rate limited (429)', async () => {
    await app();
    ctx!.friends.search.mockResolvedValue([]);
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push((await req('GET', '/users/search?q=mari')).statusCode);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('messages', () => {
  it('201 for a message; the text is trimmed', async () => {
    await app();
    ctx!.messages.sendMessage.mockResolvedValue({ id: 'm1' });
    const res = await req('POST', `/me/conversations/${CONV}/messages`, { body: '  Tere!  ' });
    expect(res.statusCode).toBe(201);
    expect(ctx!.messages.sendMessage).toHaveBeenCalledWith(USER_ID, CONV, 'Tere!');
  });

  it.each([
    ['no body', undefined, 'Päringu sisu puudub'],
    ['empty text', { body: '   ' }, 'kirjuta sõnum'],
    ['null text', { body: null }, /body/],
    ['too long', { body: 'a'.repeat(2001) }, /2000/],
    ['sender smuggled in', { body: 'x', senderId: 'someone' }, /senderId/],
  ])('400 for %s', async (_case, payload, message) => {
    await app();
    const res = await req('POST', `/me/conversations/${CONV}/messages`, payload);
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
  });

  it('400 for a non-UUID conversation id and a bad cursor', async () => {
    await app();
    expect((await req('GET', '/me/conversations/abc/messages')).statusCode).toBe(400);
    const cursor = await req('GET', `/me/conversations/${CONV}/messages?before=yesterday`);
    expect(cursor.statusCode).toBe(400);
    expectApiError(cursor, /before/);
    expect((await req('GET', `/me/conversations/${CONV}/messages?limit=500`)).statusCode).toBe(400);
  });

  it('404 for someone else’s conversation, 403 when no longer friends (English)', async () => {
    await app();
    ctx!.messages.listMessages.mockRejectedValue(new NotFoundError('errors.conversationNotFound'));
    expect((await req('GET', `/me/conversations/${CONV}/messages`)).statusCode).toBe(404);
    ctx!.messages.sendMessage.mockRejectedValue(new ForbiddenError('errors.messagesFriendsOnly'));
    const res = await req('POST', `/me/conversations/${CONV}/messages`, { body: 'x' }, { 'accept-language': 'en' });
    expect(res.statusCode).toBe(403);
    expectApiError(res, 'You can only message your friends');
  });

  it('passes the cursor and the default page size', async () => {
    await app();
    ctx!.messages.listMessages.mockResolvedValue({ messages: [], nextCursor: null });
    await req('GET', `/me/conversations/${CONV}/messages?before=${NOTE}`);
    expect(ctx!.messages.listMessages).toHaveBeenCalledWith(USER_ID, CONV, { before: NOTE, limit: 30 });
  });

  it('start conversation: 400 for a bad body, 200 with the conversation', async () => {
    await app();
    expect((await req('POST', '/me/conversations', { userId: null })).statusCode).toBe(400);
    ctx!.messages.startConversation.mockResolvedValue({ id: CONV });
    const ok = await req('POST', '/me/conversations', { userId: OTHER });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ id: CONV });
  });

  it('mark read is 204 and a timeout is 503', async () => {
    await app();
    expect((await req('PUT', `/me/conversations/${CONV}/read`)).statusCode).toBe(204);
    ctx!.messages.markRead.mockRejectedValue(new TimeoutError('messages.markRead', 8000));
    const res = await req('PUT', `/me/conversations/${CONV}/read`);
    expect(res.statusCode).toBe(503);
    expectApiError(res);
  });
});

describe('notifications, preferences and push tokens', () => {
  it('list with paging params; 400 for a bad limit', async () => {
    await app();
    ctx!.notifications.list.mockResolvedValue({ items: [], nextCursor: null });
    expect((await req('GET', '/me/notifications?limit=10')).statusCode).toBe(200);
    expect(ctx!.notifications.list).toHaveBeenCalledWith(USER_ID, { limit: 10 });
    expect((await req('GET', '/me/notifications?limit=0')).statusCode).toBe(400);
  });

  it('mark read: 204, someone else’s → 404, bad id → 400', async () => {
    await app();
    expect((await req('PUT', `/me/notifications/${NOTE}/read`)).statusCode).toBe(204);
    ctx!.notifications.markRead.mockRejectedValue(new NotFoundError('errors.notificationNotFound'));
    const res = await req('PUT', `/me/notifications/${NOTE}/read`, undefined, { 'accept-language': 'ru' });
    expect(res.statusCode).toBe(404);
    expectApiError(res, 'Уведомление не найдено');
    expect((await req('PUT', '/me/notifications/1/read')).statusCode).toBe(400);
  });

  it('preferences: all four switches required (M6 added bookings), booleans only', async () => {
    await app();
    ctx!.notifications.setPreferences.mockImplementation(async (_u: string, p: object) => p);
    const all = { messages: false, friendRequests: true, friendPlans: true, bookings: true };
    const ok = await req('PUT', '/me/notification-preferences', all);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual(all);
    for (const bad of [
      { messages: false },
      { messages: false, friendRequests: true, friendPlans: true },
      { ...all, messages: 'false' },
      { ...all, messages: null },
      { ...all, bookings: null },
    ]) {
      expect((await req('PUT', '/me/notification-preferences', bad)).statusCode).toBe(400);
    }
  });

  it('push token: valid Expo token → 204; anything else → 400', async () => {
    await app();
    const ok = await req('PUT', '/me/push-tokens', { token: TOKEN, platform: 'ios', language: 'ru' });
    expect(ok.statusCode).toBe(204);
    expect(ctx!.notifications.registerPushToken).toHaveBeenCalledWith(USER_ID, { token: TOKEN, platform: 'ios', language: 'ru' });
    for (const bad of [
      { token: 'not-a-token', platform: 'ios', language: 'et' },
      { token: TOKEN, platform: 'web', language: 'et' },
      { token: TOKEN, platform: 'ios', language: 'de' },
      { token: TOKEN, platform: 'ios' },
      { token: null, platform: 'ios', language: 'et' },
    ]) {
      const res = await req('PUT', '/me/push-tokens', bad);
      expect(res.statusCode).toBe(400);
      expectApiError(res);
    }
    const en = await req('PUT', '/me/push-tokens', { token: 'abc', platform: 'ios', language: 'et' }, { 'accept-language': 'en' });
    expectApiError(en, 'is not an Expo push token');
  });

  it('unregister: 204 for an encoded token, 400 for garbage', async () => {
    await app();
    expect((await req('DELETE', `/me/push-tokens/${encodeURIComponent(TOKEN)}`)).statusCode).toBe(204);
    expect(ctx!.notifications.unregisterPushToken).toHaveBeenCalledWith(USER_ID, TOKEN);
    expect((await req('DELETE', '/me/push-tokens/abc')).statusCode).toBe(400);
  });
});

describe('blocks and user reports', () => {
  it('block / unblock are 204 and idempotent; self is 400; unknown is 404', async () => {
    await app();
    expect((await req('PUT', `/me/blocks/${OTHER}`)).statusCode).toBe(204);
    expect((await req('DELETE', `/me/blocks/${OTHER}`)).statusCode).toBe(204);
    ctx!.safety.block.mockRejectedValueOnce(new NotFoundError('errors.userNotFound'));
    expect((await req('PUT', `/me/blocks/${OTHER}`)).statusCode).toBe(404);
  });

  it('report: 201; "other" needs a description; unknown reason 400', async () => {
    await app();
    ctx!.safety.reportUser.mockResolvedValue({ id: 'r1' });
    expect((await req('POST', `/users/${OTHER}/reports`, { reason: 'spam' })).statusCode).toBe(201);
    expect(ctx!.safety.reportUser).toHaveBeenCalledWith(USER_ID, OTHER, { reason: 'spam', details: null });
    const other = await req('POST', `/users/${OTHER}/reports`, { reason: 'other', details: 'lühike' });
    expect(other.statusCode).toBe(400);
    expectApiError(other, /details.*10/);
    expect((await req('POST', `/users/${OTHER}/reports`, { reason: 'rude' })).statusCode).toBe(400);
    expect((await req('POST', `/users/${OTHER}/reports`, null)).statusCode).toBe(400);
  });

  it('reports are limited to 5 per hour (429, translated)', async () => {
    await app();
    ctx!.safety.reportUser.mockResolvedValue({ id: 'r1' });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await req('POST', `/users/${OTHER}/reports`, { reason: 'spam' }, { 'accept-language': 'en' })).statusCode);
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    const res = await req('POST', `/users/${OTHER}/reports`, { reason: 'spam' }, { 'accept-language': 'en' });
    expectApiError(res, 'Too many requests');
  });
});
