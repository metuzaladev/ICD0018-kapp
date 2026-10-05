/**
 * M5 end to end with real auth, PostgreSQL, Socket.IO and the BullMQ queue in Redis:
 * search → friend request → accept → presence for friends → plan → messages over the socket
 * (members only) → notification rows → push job in the recipient's language → worker against a
 * mocked Expo endpoint → block removes the friendship and hides both users from each other.
 * Nothing here talks to the real Expo push service (undici MockAgent with net connect disabled).
 */
import type { AddressInfo } from 'node:net';

import { eq, inArray, like } from 'drizzle-orm';
import { io as connect, type Socket } from 'socket.io-client';
import { MockAgent } from 'undici';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { REALTIME_PATH, type Message } from '@kapp/shared';
import { env } from '../../src/config/env';
import { db, pool } from '../../src/db/client';
import { notifications, parks, pushTokens, user } from '../../src/db/schema';
import { createPushTokensRepository } from '../../src/modules/notifications/notifications.repository';
import { createPushQueue } from '../../src/modules/notifications/push-queue';
import { createExpoPushClient, createPushProcessor } from '../../src/modules/notifications/push-worker';
import { buildRealApp, createSocketGateway, signUpAndGetCookie } from './real-app';

const DOMAIN = '@community-flow.test.invalid';
const RUN = Date.now();
const queue = createPushQueue({ url: env.REDIS_URL, prefix: `kapp-test-${RUN}` });
const realtime = createSocketGateway();
let app: Awaited<ReturnType<typeof buildRealApp>>;
let baseUrl = '';
let parkId = '';
const people = { mari: { cookie: '', id: '' }, liis: { cookie: '', id: '' }, toomas: { cookie: '', id: '' } };
const sockets: Socket[] = [];
const B_TOKEN = 'ExponentPushToken[liisdevice0001]';

type Who = keyof typeof people;
const api = (who: Who, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object, headers: Record<string, string> = {}) =>
  app.inject({ method, url: `/api/v1${url}`, headers: { cookie: people[who].cookie, ...headers }, payload });

function openSocket(cookie: string | null): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(baseUrl, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      extraHeaders: cookie ? { cookie } : {},
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}

const collect = <T>(socket: Socket, event: string) => {
  const received: T[] = [];
  socket.on(event, (payload: T) => received.push(payload));
  return received;
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  app = await buildRealApp(undefined, { realtime, pushQueue: queue });
  await app.listen({ host: '127.0.0.1', port: 0 });
  baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  for (const who of Object.keys(people) as Who[]) {
    people[who].cookie = await signUpAndGetCookie(app, `${who}-${RUN}${DOMAIN}`);
    people[who].id = (await api(who, 'GET', '/me')).json().id;
  }
  // Unique names so the search cannot hit other test data.
  await db.update(user).set({ name: `Mari${RUN} Tamm` }).where(eq(user.id, people.mari.id));
  await db.update(user).set({ name: `Liis${RUN} Kask`, area: 'Kadriorg' }).where(eq(user.id, people.liis.id));
  await db.update(user).set({ name: `Toomas${RUN} Mets` }).where(eq(user.id, people.toomas.id));
  const [park] = await db
    .insert(parks)
    .values({ name: 'IT Viljandi', location: { x: 25.59, y: 58.36 }, status: 'approved' })
    .returning({ id: parks.id });
  parkId = park!.id;
});

afterAll(async () => {
  for (const s of sockets) s.close();
  await app.close();
  await queue.queue.obliterate({ force: true });
  await queue.close();
  await db.delete(parks).where(eq(parks.id, parkId));
  await db.delete(user).where(like(user.email, `%${DOMAIN}`));
  await pool.end();
});

describe('M5 community flow', () => {
  let bellaId = '';
  let conversationId = '';

  it('Liis registers her device in Russian and has a dog called Bella', async () => {
    expect((await api('liis', 'PUT', '/me/push-tokens', { token: B_TOKEN, platform: 'ios', language: 'ru' })).statusCode).toBe(204);
    expect((await api('liis', 'GET', '/me')).json()).toMatchObject({ language: 'ru', allowFriendRequests: true });
    const dog = await api('liis', 'POST', '/me/dogs', { name: `Bella${RUN}` });
    bellaId = dog.json().id;
  });

  it('finds people by owner or dog name, first name and dog names only', async () => {
    const byDog = (await api('mari', 'GET', `/users/search?q=bella${RUN}`)).json();
    expect(byDog).toEqual([
      { id: people.liis.id, firstName: `Liis${RUN}`, area: 'Kadriorg', dogNames: [`Bella${RUN}`], relation: 'none', acceptsRequests: true },
    ]);
    const byName = (await api('mari', 'GET', `/users/search?q=toomas${RUN}`)).json();
    expect(byName).toHaveLength(1);
    expect(JSON.stringify(byName)).not.toContain('@');
    // A LIKE wildcard is searched as text, not as "anything".
    expect((await api('mari', 'GET', '/users/search?q=%25%25%25')).json()).toEqual([]);
  });

  it('a user who turned requests off cannot be asked (403)', async () => {
    await api('toomas', 'PATCH', '/me', { allowFriendRequests: false });
    const res = await api('mari', 'POST', '/me/friend-requests', { userId: people.toomas.id });
    expect(res.statusCode).toBe(403);
  });

  it('friend request → notification row → push job in Russian', async () => {
    const res = await api('mari', 'POST', '/me/friend-requests', { userId: people.liis.id });
    expect(res.statusCode).toBe(201);
    expect((await api('mari', 'POST', '/me/friend-requests', { userId: people.liis.id })).statusCode).toBe(200);

    const requests = (await api('liis', 'GET', '/me/friend-requests')).json();
    expect(requests.incoming.map((r: { user: { id: string } }) => r.user.id)).toEqual([people.mari.id]);

    const feed = (await api('liis', 'GET', '/me/notifications')).json();
    expect(feed.items[0]).toMatchObject({ type: 'friend_request', actor: { id: people.mari.id, firstName: `Mari${RUN}` }, readAt: null });

    const jobs = await queue.queue.getJobs(['waiting', 'delayed', 'active']);
    const job = jobs.find((j) => j.data.userId === people.liis.id);
    expect(job?.data).toMatchObject({ language: 'ru', title: 'Новый запрос в друзья', body: `Mari${RUN} хочет добавить вас в друзья` });
  });

  it('accepting makes them friends and presence "friends" now shows Liis to Mari', async () => {
    expect((await api('liis', 'POST', `/me/friend-requests/${people.mari.id}/accept`)).statusCode).toBe(204);
    expect((await api('mari', 'GET', '/me/friends')).json()).toMatchObject([{ id: people.liis.id, dogNames: [`Bella${RUN}`] }]);
    const accepted = (await api('mari', 'GET', '/me/notifications')).json().items[0];
    expect(accepted).toMatchObject({ type: 'friend_accepted', actor: { id: people.liis.id } });

    expect((await api('liis', 'POST', '/me/check-ins', { parkId, dogIds: [bellaId] })).statusCode).toBe(201);
    const { visitors } = (await api('mari', 'GET', `/parks/${parkId}/visitors`)).json();
    expect(visitors).toMatchObject([{ userId: people.liis.id, ownerFirstName: `Liis${RUN}` }]);
    // Toomas is not a friend: Liis shares with friends only.
    expect((await api('toomas', 'GET', `/parks/${parkId}/visitors`)).json().visitors).toEqual([]);
  });

  it('a friend’s plan appears on Home and as a notification', async () => {
    const startsAt = new Date(Date.now() + 2 * 3600_000).toISOString();
    const endsAt = new Date(Date.now() + 3 * 3600_000).toISOString();
    expect((await api('liis', 'POST', '/me/planned-visits', { parkId, startsAt, endsAt })).statusCode).toBe(201);
    const plans = (await api('mari', 'GET', '/me/friends/plans')).json();
    expect(plans).toMatchObject([{ friend: { id: people.liis.id }, park: { id: parkId, name: 'IT Viljandi' } }]);
    expect((await api('toomas', 'GET', '/me/friends/plans')).json()).toEqual([]);
    expect((await api('mari', 'GET', '/me/notifications')).json().items[0]).toMatchObject({ type: 'friend_plan', data: { parkName: 'IT Viljandi' } });
  });

  it('rejects a socket without a session', async () => {
    await expect(openSocket(null)).rejects.toThrow('unauthorized');
  });

  it('delivers a message over the socket to conversation members only', async () => {
    const mariSocket = await openSocket(people.mari.cookie);
    const liisSocket = await openSocket(people.liis.cookie);
    const toomasSocket = await openSocket(people.toomas.cookie);
    const toLiis = collect<Message>(liisSocket, 'message:new');
    const toMari = collect<Message>(mariSocket, 'message:new');
    const toToomas = collect<Message>(toomasSocket, 'message:new');
    const liisNotifications = collect<{ unreadCount: number }>(liisSocket, 'notification:new');

    // Toomas is not Mari's friend: no conversation for him.
    expect((await api('toomas', 'POST', '/me/conversations', { userId: people.mari.id })).statusCode).toBe(403);

    const started = await api('mari', 'POST', '/me/conversations', { userId: people.liis.id });
    expect(started.statusCode).toBe(200);
    conversationId = started.json().id;
    expect((await api('liis', 'POST', '/me/conversations', { userId: people.mari.id })).json().id).toBe(conversationId);

    const sent = await api('mari', 'POST', `/me/conversations/${conversationId}/messages`, { body: 'Tere! Kas Bella tuleb täna parki?' });
    expect(sent.statusCode).toBe(201);
    await pause(300);
    expect(toLiis.map((m) => m.body)).toEqual(['Tere! Kas Bella tuleb täna parki?']);
    expect(toMari).toHaveLength(1);
    expect(toToomas).toEqual([]);
    expect(liisNotifications.at(-1)?.unreadCount).toBeGreaterThan(0);

    // Toomas cannot read it either (404, not 403).
    expect((await api('toomas', 'GET', `/me/conversations/${conversationId}/messages`)).statusCode).toBe(404);
  });

  it('unread counts, one notification per conversation, read receipts clear both', async () => {
    await api('mari', 'POST', `/me/conversations/${conversationId}/messages`, { body: 'Kell viis?' });
    const inbox = (await api('liis', 'GET', '/me/conversations')).json();
    expect(inbox[0]).toMatchObject({ id: conversationId, unreadCount: 2, canMessage: true, lastMessage: { body: 'Kell viis?' } });

    const messageRows = await db
      .select({ id: notifications.id, data: notifications.data })
      .from(notifications)
      .where(eq(notifications.userId, people.liis.id));
    expect(messageRows.filter((r) => r.data.conversationId === conversationId)).toHaveLength(1);

    expect((await api('liis', 'PUT', `/me/conversations/${conversationId}/read`)).statusCode).toBe(204);
    expect((await api('liis', 'GET', '/me/conversations')).json()[0].unreadCount).toBe(0);
    const unread = (await api('liis', 'GET', '/me/notifications/unread-count')).json().count;
    // The friend request is still unread; the message notification is not.
    expect(unread).toBe(1);
    expect((await api('liis', 'PUT', '/me/notifications/read-all')).statusCode).toBe(204);
    expect((await api('liis', 'GET', '/me/notifications/unread-count')).json()).toEqual({ count: 0 });
  });

  it('pages messages newest first with a before cursor', async () => {
    for (const body of ['üks', 'kaks', 'kolm']) await api('liis', 'POST', `/me/conversations/${conversationId}/messages`, { body });
    const first = (await api('mari', 'GET', `/me/conversations/${conversationId}/messages?limit=2`)).json();
    expect(first.messages.map((m: Message) => m.body)).toEqual(['kolm', 'kaks']);
    const second = (await api('mari', 'GET', `/me/conversations/${conversationId}/messages?limit=10&before=${first.nextCursor}`)).json();
    expect(second.messages.map((m: Message) => m.body)).toEqual(['üks', 'Kell viis?', 'Tere! Kas Bella tuleb täna parki?']);
    expect(second.nextCursor).toBeNull();
  });

  it('respects the push preference', async () => {
    await api('liis', 'PUT', '/me/notification-preferences', { messages: false, friendRequests: true, friendPlans: true });
    const before = (await queue.queue.getJobs(['waiting', 'delayed', 'active'])).filter((j) => j.data.userId === people.liis.id).length;
    await api('mari', 'POST', `/me/conversations/${conversationId}/messages`, { body: 'Vaikne sõnum' });
    const after = (await queue.queue.getJobs(['waiting', 'delayed', 'active'])).filter((j) => j.data.userId === people.liis.id).length;
    expect(after).toBe(before);
  });

  it('the worker sends Liis’s push to a mocked Expo endpoint and drops a gone device', async () => {
    const [job] = (await queue.queue.getJobs(['waiting'])).filter((j) => j.data.userId === people.liis.id && j.data.language === 'ru');
    const agent = new MockAgent();
    agent.disableNetConnect();
    let sent: { to: string; title: string }[] = [];
    agent
      .get('https://exp.host')
      .intercept({ path: '/--/api/v2/push/send', method: 'POST' })
      .reply(200, (opts) => {
        sent = JSON.parse(String(opts.body));
        return { data: [{ status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }] };
      });
    const processor = createPushProcessor({
      tokens: createPushTokensRepository(db),
      client: createExpoPushClient({ httpAgent: agent }),
      scheduleReceipts: async () => {},
    });
    await processor(job!);
    await agent.close();
    expect(sent).toMatchObject([{ to: B_TOKEN, title: job!.data.title }]);
    expect(job!.data.title).toMatch(/^(Новый запрос в друзья|Сообщение от Mari)/);
    expect(await db.select().from(pushTokens).where(eq(pushTokens.token, B_TOKEN))).toEqual([]);
  });

  it('blocking removes the friendship, hides both users everywhere and stops messages', async () => {
    expect((await api('liis', 'PUT', `/me/blocks/${people.mari.id}`)).statusCode).toBe(204);
    expect((await api('liis', 'PUT', `/me/blocks/${people.mari.id}`)).statusCode).toBe(204);
    expect((await api('liis', 'GET', '/me/blocks')).json()).toMatchObject([{ id: people.mari.id, firstName: `Mari${RUN}` }]);

    expect((await api('mari', 'GET', '/me/friends')).json()).toEqual([]);
    expect((await api('mari', 'GET', `/users/search?q=liis${RUN}`)).json()).toEqual([]);
    expect((await api('liis', 'GET', `/users/search?q=mari${RUN}`)).json()).toEqual([]);
    expect((await api('mari', 'GET', `/users/${people.liis.id}`)).statusCode).toBe(404);
    expect((await api('mari', 'GET', `/parks/${parkId}/visitors`)).json().visitors).toEqual([]);
    expect((await api('mari', 'GET', '/me/friends/plans')).json()).toEqual([]);
    expect((await api('mari', 'GET', '/me/conversations')).json()).toEqual([]);
    expect((await api('mari', 'POST', `/me/conversations/${conversationId}/messages`, { body: 'Halloo?' })).statusCode).toBe(404);
    expect((await api('mari', 'POST', '/me/friend-requests', { userId: people.liis.id })).statusCode).toBe(404);
    // Notifications caused by the blocked user disappear from the feed too.
    const feed = (await api('liis', 'GET', '/me/notifications')).json();
    expect(feed.items.some((n: { actor: { id: string } | null }) => n.actor?.id === people.mari.id)).toBe(false);
  });

  it('a user report is stored; unblocking restores visibility but not the friendship', async () => {
    const report = await api('liis', 'POST', `/users/${people.mari.id}/reports`, { reason: 'harassment', details: 'Kirjutas pärast blokeerimist' });
    expect(report.statusCode).toBe(201);
    expect((await api('liis', 'DELETE', `/me/blocks/${people.mari.id}`)).statusCode).toBe(204);
    expect((await api('mari', 'GET', `/users/search?q=liis${RUN}`)).json()).toMatchObject([{ relation: 'none' }]);
    const conversation = (await api('mari', 'GET', `/me/conversations/${conversationId}`)).json();
    expect(conversation).toMatchObject({ id: conversationId, canMessage: false });
    expect((await api('mari', 'POST', `/me/conversations/${conversationId}/messages`, { body: 'Tere uuesti' })).statusCode).toBe(403);
  });

  it('cleans up: own rows only', async () => {
    const ids = Object.values(people).map((p) => p.id);
    expect((await db.select({ id: user.id }).from(user).where(inArray(user.id, ids))).length).toBe(3);
  });
});
