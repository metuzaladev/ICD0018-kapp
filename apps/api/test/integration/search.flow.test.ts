/**
 * Map search end to end with real PostgreSQL (docs/19): GET /search finds approved parks by name
 * and address, approved community picks only, hides picks by authors blocked either way, puts
 * prefix matches first and sorts by distance. The address half is off (noAddressLookup) so the
 * test never calls In-ADS. A unique token in every name keeps seed data out of the results.
 */
import type { SearchResponse } from '@kapp/shared';
import { inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db, pool } from '../../src/db/client';
import { parks, placePosts, user, userBlocks } from '../../src/db/schema';
import { buildRealApp, signUpAndGetCookie } from './real-app';

const DOMAIN = '@search-flow.test.invalid';
const RUN = Date.now();
const TOKEN = `zq${RUN.toString(36)}`;
let app: Awaited<ReturnType<typeof buildRealApp>>;
let cookie = '';
let viewerId = '';
const parkIds: string[] = [];

const search = (q: string, extra = '', withCookie = true) =>
  app.inject({ method: 'GET', url: `/api/v1/search?q=${encodeURIComponent(q)}${extra}`, headers: withCookie ? { cookie } : {} });

beforeAll(async () => {
  app = await buildRealApp();
  cookie = await signUpAndGetCookie(app, `viewer-${RUN}${DOMAIN}`);
  viewerId = (await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } })).json().id;
  const created = await db
    .insert(parks)
    .values([
      { name: `${TOKEN} Kaugpark`, address: 'Tartu', location: { x: 26.72, y: 58.38 }, status: 'approved' },
      { name: `Vana ${TOKEN} park`, address: 'Tallinn', location: { x: 24.75, y: 59.43 }, status: 'approved' },
      { name: `${TOKEN} Lähipark`, address: 'Tallinn', location: { x: 24.76, y: 59.44 }, status: 'approved' },
      { name: `${TOKEN} ootel`, location: { x: 24.7, y: 59.4 }, status: 'pending' },
      { name: 'Aadressiga park', address: `${TOKEN} tänav 5`, location: { x: 24.7, y: 59.41 }, status: 'approved' },
    ])
    .returning({ id: parks.id });
  parkIds.push(...created.map((p) => p.id));
  const author = `author-${RUN}`;
  const blocked = `blocked-${RUN}`;
  await db.insert(user).values([
    { id: author, name: 'Autor Perenimi', email: `${author}${DOMAIN}` },
    { id: blocked, name: 'Blokk Perenimi', email: `${blocked}${DOMAIN}` },
  ]);
  await db.insert(placePosts).values([
    { authorId: author, name: `${TOKEN} kohvik`, category: 'cafe', location: { x: 24.74, y: 59.44 }, status: 'approved', moderatedAt: new Date() },
    { authorId: author, name: `${TOKEN} ootel kohvik`, category: 'cafe', location: { x: 24.74, y: 59.44 }, status: 'pending' },
    { authorId: blocked, name: `${TOKEN} blokeeritu rand`, category: 'beach', location: { x: 24.8, y: 59.47 }, status: 'approved', moderatedAt: new Date() },
  ]);
  await db.insert(userBlocks).values({ blockerId: viewerId, blockedId: blocked });
});

afterAll(async () => {
  await db.delete(parks).where(inArray(parks.id, parkIds));
  await db.delete(user).where(like(user.email, `%${DOMAIN}`)); // cascades posts and blocks
  await app.close();
  await pool.end();
});

describe('GET /search', () => {
  it('finds approved parks by name and address, prefix matches first, then nearest', async () => {
    const res = await search(TOKEN, '&lat=59.437&lng=24.7536');
    expect(res.statusCode).toBe(200);
    const body = res.json<SearchResponse>();
    const parksFound = body.results.filter((r) => r.kind === 'park').map((r) => r.name);
    // Prefix matches (nearest first), then the contains-matches; the pending park is never found.
    expect(parksFound.slice(0, 2)).toEqual([`${TOKEN} Lähipark`, `${TOKEN} Kaugpark`]);
    expect(parksFound).toEqual(expect.arrayContaining([`Vana ${TOKEN} park`, 'Aadressiga park']));
    expect(parksFound).not.toContain(`${TOKEN} ootel`);
    const near = body.results.find((r) => r.name === `${TOKEN} Lähipark`)!;
    expect(near.distanceKm).toBeLessThan(1);
    expect(near).toMatchObject({ zoom: 15, category: 'park' });
    expect(body.addressesAvailable).toBe(true);
  });

  it('shows approved community picks only and hides blocked authors', async () => {
    const posts = (await search(TOKEN)).json<SearchResponse>().results.filter((r) => r.kind === 'post').map((r) => r.name);
    expect(posts).toEqual([`${TOKEN} kohvik`]);
  });

  it('without a session the blocked author is not hidden (nobody to hide from)', async () => {
    const posts = (await search(TOKEN, '', false)).json<SearchResponse>().results.filter((r) => r.kind === 'post').map((r) => r.name);
    expect(posts).toEqual(expect.arrayContaining([`${TOKEN} kohvik`, `${TOKEN} blokeeritu rand`]));
  });

  it('treats LIKE wildcards literally', async () => {
    const res = await search(`${TOKEN}%_`);
    expect(res.statusCode).toBe(200);
    expect(res.json<SearchResponse>().results).toEqual([]);
  });

  it('distance is null without an origin', async () => {
    const res = (await search(TOKEN)).json<SearchResponse>();
    expect(res.results.every((r) => r.distanceKm === null)).toBe(true);
  });
});
