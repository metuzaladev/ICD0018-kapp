import { afterEach, describe, expect, it } from 'vitest';

import { TimeoutError } from '../../src/lib/timeout';
import { buildTestApp, fakeAuth, USER_ID } from '../helpers';
import { expectApiError } from './expect-api-error';

let ctx: Awaited<ReturnType<typeof buildTestApp>> | undefined;
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

const auth = { authorization: 'Bearer test' };
const body = {
  results: [{ kind: 'park', id: 'p1', name: 'Politseiaia koertepark', subtitle: 'Tallinn', category: 'park', lat: 59.43, lng: 24.76, zoom: 15, distanceKm: 0.7 }],
  addressesAvailable: true,
};

describe('GET /api/v1/search (map search)', () => {
  it('is public: works without a session', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    ctx.search.search.mockResolvedValue(body);
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/search?q=politsei' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(body);
    expect(ctx.search.search).toHaveBeenCalledWith(undefined, { q: 'politsei' });
  });

  it('passes the signed-in viewer (blocked authors are hidden) and the origin', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    ctx.search.search.mockResolvedValue(body);
    await ctx.app.inject({ method: 'GET', url: '/api/v1/search?q=%20Kalamaja%20&lat=59.437&lng=24.7536', headers: auth });
    expect(ctx.search.search).toHaveBeenCalledWith(USER_ID, { q: 'Kalamaja', lat: 59.437, lng: 24.7536 });
  });

  it.each([
    ['no query', '', /"q"/],
    ['a one-letter query', '?q=x', /"q"/],
    ['an over-long query', `?q=${'a'.repeat(81)}`, /"q"/],
    ['latitude without longitude', '?q=park&lat=59', /"lat"/],
    ['an unknown parameter', '?q=park&limit=50', /limit|tundmatu|unknown/i],
  ])('400 for %s', async (_name, query, message) => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/search${query}` });
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
    expect(ctx.search.search).not.toHaveBeenCalled();
  });

  it('translates the validation message (Accept-Language: en)', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/search?q=x', headers: { 'accept-language': 'en' } });
    expectApiError(res, /at least 2 characters/);
  });

  it('503 when the database times out', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    ctx.search.search.mockRejectedValue(new TimeoutError('search.places', 8000));
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/search?q=park' });
    expect(res.statusCode).toBe(503);
    expectApiError(res);
  });
});
