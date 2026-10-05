/**
 * Park filters, review summary and favourites through the real HTTP stack, PostGIS and auth.
 * Creates its own parks far from the seed data (Saaremaa) so results are deterministic.
 */
import { inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db, pool } from '../../src/db/client';
import { checkInDogs, checkIns, dogs, parks, reviews, user } from '../../src/db/schema';
import { buildRealApp, signUpAndGetCookie } from './real-app';

const EMAIL_DOMAIN = '@parks-fav.test.invalid';
const ORIGIN = { lat: 58.25, lng: 22.5 }; // Kuressaare area — no seed parks within 5 km
let app: Awaited<ReturnType<typeof buildRealApp>>;
let cookie = '';
const ids = { water: '', dry: '', pending: '' };

beforeAll(async () => {
  app = await buildRealApp();
  cookie = await signUpAndGetCookie(app, `fav-${Date.now()}${EMAIL_DOMAIN}`);

  const inserted = await db
    .insert(parks)
    .values([
      { name: 'IT Veega park', location: { x: 22.501, y: 58.251 }, water: true, status: 'approved' },
      { name: 'IT Kuiv park', location: { x: 22.502, y: 58.252 }, water: false, status: 'approved' },
      { name: 'IT Ootel park', location: { x: 22.503, y: 58.253 }, water: true, status: 'pending' },
    ])
    .returning({ id: parks.id, name: parks.name });
  ids.water = inserted.find((p) => p.name === 'IT Veega park')!.id;
  ids.dry = inserted.find((p) => p.name === 'IT Kuiv park')!.id;
  ids.pending = inserted.find((p) => p.name === 'IT Ootel park')!.id;

  const [reviewer] = await db.select({ id: user.id }).from(user).where(like(user.email, `%${EMAIL_DOMAIN}`));
  // One review per user per park (unique index) — the second rating needs a second user.
  const secondId = `second-${Date.now()}`;
  await db.insert(user).values({ id: secondId, name: 'Teine', email: `second-${Date.now()}${EMAIL_DOMAIN}` });
  await db.insert(reviews).values([
    { userId: reviewer!.id, parkId: ids.water, rating: 5 },
    { userId: secondId, parkId: ids.water, rating: 4 },
  ]);

  // Two dogs checked in now, one in an expired check-in that must not be counted.
  const [a, b, c] = await db
    .insert(dogs)
    .values([{ ownerId: reviewer!.id, name: 'A' }, { ownerId: reviewer!.id, name: 'B' }, { ownerId: reviewer!.id, name: 'C' }])
    .returning({ id: dogs.id });
  const [active, expired] = await db
    .insert(checkIns)
    .values([
      { userId: reviewer!.id, parkId: ids.water, expiresAt: new Date(Date.now() + 3600_000) },
      { userId: reviewer!.id, parkId: ids.water, expiresAt: new Date(Date.now() - 60_000), endedAt: new Date(Date.now() - 60_000) },
    ])
    .returning({ id: checkIns.id });
  await db.insert(checkInDogs).values([
    { checkInId: active!.id, dogId: a!.id },
    { checkInId: active!.id, dogId: b!.id },
    { checkInId: expired!.id, dogId: c!.id },
  ]);
});

afterAll(async () => {
  await db.delete(parks).where(inArray(parks.id, Object.values(ids)));
  await db.delete(user).where(like(user.email, `%${EMAIL_DOMAIN}`));
  await app.close();
  await pool.end();
});

const nearby = (qs = '') => app.inject({ method: 'GET', url: `/api/v1/parks/nearby?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&radiusKm=5${qs}` });

describe('nearby filters', () => {
  it('returns only approved parks', async () => {
    const names = (await nearby()).json().map((p: { name: string }) => p.name);
    expect(names).toEqual(['IT Veega park', 'IT Kuiv park']);
  });

  it('water=true narrows the result; water=false means "don\'t care"', async () => {
    expect((await nearby('&water=true')).json().map((p: { id: string }) => p.id)).toEqual([ids.water]);
    expect((await nearby('&water=false')).json()).toHaveLength(2);
  });
});

describe('active dogs counter', () => {
  it('counts dogs in unexpired check-ins only', async () => {
    const water = (await nearby()).json().find((p: { id: string }) => p.id === ids.water);
    expect(water.activeDogs).toBe(2);
    const detail = await app.inject({ method: 'GET', url: `/api/v1/parks/${ids.water}` });
    expect(detail.json().activeDogs).toBe(2);
  });
});

describe('park detail', () => {
  it('includes the review summary', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/parks/${ids.water}` });
    expect(res.json()).toMatchObject({ ratingAverage: 4.5, reviewCount: 2 });
    expect(res.json()).not.toHaveProperty('isFavorite');
  });

  it('a park without reviews has a null average', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/parks/${ids.dry}` });
    expect(res.json()).toMatchObject({ ratingAverage: null, reviewCount: 0 });
  });
});

describe('favourites', () => {
  const put = (id: string) => app.inject({ method: 'PUT', url: `/api/v1/me/favorites/${id}`, headers: { cookie } });

  it('adds idempotently and shows isFavorite on the detail', async () => {
    expect((await put(ids.water)).statusCode).toBe(204);
    expect((await put(ids.water)).statusCode).toBe(204);
    const detail = await app.inject({ method: 'GET', url: `/api/v1/parks/${ids.water}`, headers: { cookie } });
    expect(detail.json().isFavorite).toBe(true);
    const list = await app.inject({ method: 'GET', url: '/api/v1/me/favorites', headers: { cookie } });
    expect(list.json().map((p: { id: string }) => p.id)).toEqual([ids.water]);
  });

  it('refuses a pending park with 404', async () => {
    expect((await put(ids.pending)).statusCode).toBe(404);
  });

  it('removes idempotently', async () => {
    const del = () => app.inject({ method: 'DELETE', url: `/api/v1/me/favorites/${ids.water}`, headers: { cookie } });
    expect((await del()).statusCode).toBe(204);
    expect((await del()).statusCode).toBe(204);
    const detail = await app.inject({ method: 'GET', url: `/api/v1/parks/${ids.water}`, headers: { cookie } });
    expect(detail.json().isFavorite).toBe(false);
  });
});
