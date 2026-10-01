/**
 * M3 end to end with real auth and PostGIS: dogs, check-in, presence privacy, history,
 * reviews (visit required), plans and reports. Parks are created near Pärnu so no seed data interferes.
 */
import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db, pool } from '../../src/db/client';
import { checkInDogs, checkIns, dogs, friendships, parks, user, userBlocks } from '../../src/db/schema';
import { buildRealApp, signUpAndGetCookie } from './real-app';

const DOMAIN = '@visits-flow.test.invalid';
let app: Awaited<ReturnType<typeof buildRealApp>>;
let cookie = '';
let viewerId = '';
const parkIds = { a: '', b: '' };
const others: Record<'everyone' | 'nobody' | 'friend' | 'blocked', string> = { everyone: '', nobody: '', friend: '', blocked: '' };

const api = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${url}`, headers: { cookie }, payload });

/** Another user who is in park A right now with one dog. */
async function seedVisitor(key: keyof typeof others, presence: 'everyone' | 'friends' | 'nobody') {
  const id = `${key}-${Date.now()}`;
  await db.insert(user).values({ id, name: `${key} Perenimi`, email: `${id}${DOMAIN}`, presenceSharing: presence });
  const [dog] = await db.insert(dogs).values({ ownerId: id, name: `Koer-${key}` }).returning({ id: dogs.id });
  const [ci] = await db
    .insert(checkIns)
    .values({ userId: id, parkId: parkIds.a, expiresAt: new Date(Date.now() + 3600_000) })
    .returning({ id: checkIns.id });
  await db.insert(checkInDogs).values({ checkInId: ci!.id, dogId: dog!.id });
  others[key] = id;
}

beforeAll(async () => {
  app = await buildRealApp();
  cookie = await signUpAndGetCookie(app, `viewer-${Date.now()}${DOMAIN}`);
  viewerId = (await api('GET', '/me')).json().id;
  const created = await db
    .insert(parks)
    .values([
      { name: 'IT Pärnu A', location: { x: 24.5, y: 58.38 }, status: 'approved' },
      { name: 'IT Pärnu B', location: { x: 24.51, y: 58.381 }, status: 'approved' },
    ])
    .returning({ id: parks.id, name: parks.name });
  parkIds.a = created.find((p) => p.name === 'IT Pärnu A')!.id;
  parkIds.b = created.find((p) => p.name === 'IT Pärnu B')!.id;

  await seedVisitor('everyone', 'everyone');
  await seedVisitor('nobody', 'nobody');
  await seedVisitor('friend', 'friends');
  await seedVisitor('blocked', 'everyone');
  await db.insert(friendships).values({ requesterId: viewerId, addresseeId: others.friend, status: 'accepted' });
  await db.insert(userBlocks).values({ blockerId: others.blocked, blockedId: viewerId });
});

afterAll(async () => {
  await db.delete(parks).where(inArray(parks.id, Object.values(parkIds)));
  await db.delete(user).where(like(user.email, `%${DOMAIN}`));
  await app.close();
  await pool.end();
});

describe('M3 visit flow', () => {
  let dogId = '';

  it('creates a dog and refuses a check-in with someone else’s dog', async () => {
    const res = await api('POST', '/me/dogs', { name: 'Freddy', breed: 'Cardigan corgi', weightKg: 12.5 });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: 'Freddy', weightKg: 12.5 });
    dogId = res.json().id;

    const [foreign] = await db.select({ id: dogs.id }).from(dogs).where(eq(dogs.ownerId, others.everyone));
    const bad = await api('POST', '/me/check-ins', { parkId: parkIds.a, dogIds: [foreign!.id] });
    expect(bad.statusCode).toBe(404);
  });

  it('review before any visit is 403', async () => {
    expect((await api('PUT', `/parks/${parkIds.a}/reviews/mine`, { rating: 5 })).statusCode).toBe(403);
  });

  it('checks in and sees the active visit', async () => {
    const res = await api('POST', '/me/check-ins', { parkId: parkIds.a, dogIds: [dogId], durationMinutes: 30 });
    expect(res.statusCode).toBe(201);
    const active = (await api('GET', '/me/check-ins/active')).json();
    expect(active).toMatchObject({ park: { id: parkIds.a }, dogs: [{ name: 'Freddy' }] });
    const minutes = (Date.parse(active.expiresAt) - Date.parse(active.startedAt)) / 60_000;
    expect(Math.round(minutes)).toBe(30);
  });

  it('shows visitors according to their privacy setting and blocks', async () => {
    const { visitors, hiddenDogs } = (await api('GET', `/parks/${parkIds.a}/visitors`)).json();
    const names = visitors.map((v: { ownerFirstName: string; isMe: boolean }) => (v.isMe ? 'me' : v.ownerFirstName)).sort();
    // everyone ✔, friend (accepted) ✔, me ✔; nobody ✘, blocked-me ✘ (but their dogs are counted)
    expect(names).toEqual(['everyone', 'friend', 'me']);
    expect(hiddenDogs).toBe(2);
    expect(visitors.every((v: { ownerFirstName: string }) => !v.ownerFirstName.includes('Perenimi'))).toBe(true);

    const detail = (await app.inject({ method: 'GET', url: `/api/v1/parks/${parkIds.a}` })).json();
    expect(detail.activeDogs).toBe(5);
  });

  it('a new check-in elsewhere closes the previous one, which moves to history', async () => {
    expect((await api('POST', '/me/check-ins', { parkId: parkIds.b, dogIds: [dogId] })).statusCode).toBe(201);
    const history = (await api('GET', '/me/visits')).json();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ park: { id: parkIds.a }, hasReview: false });
  });

  it('ends the visit; ending again is still fine', async () => {
    const active = (await api('GET', '/me/check-ins/active')).json();
    expect((await api('POST', `/me/check-ins/${active.id}/end`)).statusCode).toBe(204);
    expect((await api('POST', `/me/check-ins/${active.id}/end`)).statusCode).toBe(204);
    expect((await api('GET', '/me/check-ins/active')).json()).toBeNull();
  });

  it('reviews after the visit; a second review replaces the first', async () => {
    expect((await api('PUT', `/parks/${parkIds.a}/reviews/mine`, { rating: 3 })).statusCode).toBe(200);
    expect((await api('PUT', `/parks/${parkIds.a}/reviews/mine`, { rating: 5, body: 'Mõnus!' })).statusCode).toBe(200);
    const list = (await api('GET', `/parks/${parkIds.a}/reviews`)).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ rating: 5, body: 'Mõnus!' });
    const history = (await api('GET', '/me/visits')).json() as { park: { id: string }; hasReview: boolean }[];
    expect(history.find((h) => h.park.id === parkIds.a)?.hasReview).toBe(true);
    expect(history.find((h) => h.park.id === parkIds.b)?.hasReview).toBe(false);
  });

  it('plans a visit, lists it and cancels it', async () => {
    const starts = new Date(Date.now() + 2 * 3600_000).toISOString();
    const ends = new Date(Date.now() + 3 * 3600_000).toISOString();
    const created = await api('POST', '/me/planned-visits', { parkId: parkIds.b, startsAt: starts, endsAt: ends, note: 'Tule ka!' });
    expect(created.statusCode).toBe(201);
    expect((await api('GET', '/me/planned-visits')).json()).toHaveLength(1);
    expect((await api('DELETE', `/me/planned-visits/${created.json().id}`)).statusCode).toBe(204);
    expect((await api('GET', '/me/planned-visits')).json()).toHaveLength(0);
  });

  it('reports a hazard', async () => {
    const res = await api('POST', `/parks/${parkIds.a}/reports`, { description: 'Värava lukk ei sulgu korralikult' });
    expect(res.statusCode).toBe(201);
  });

  it('deleting the dog is scoped to the owner', async () => {
    const [foreign] = await db.select({ id: dogs.id }).from(dogs).where(eq(dogs.ownerId, others.nobody));
    expect((await api('DELETE', `/me/dogs/${foreign!.id}`)).statusCode).toBe(404);
    expect((await api('DELETE', `/me/dogs/${dogId}`)).statusCode).toBe(204);
  });
});
