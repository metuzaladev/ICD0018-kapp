import { afterEach, describe, expect, it } from 'vitest';

import { TimeoutError } from '../../src/lib/timeout';
import { buildTestApp, fakeAuth, PARK_ID, USER_ID } from '../helpers';
import { expectApiError } from './expect-api-error';

let ctx: Awaited<ReturnType<typeof buildTestApp>> | undefined;
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

const auth = { authorization: 'Bearer test' };
const OTHER = '7f1c1e0a-3b2d-4c5e-9f00-112233445566';
const body = {
  date: '2026-10-05',
  parks: [{ id: PARK_ID, name: 'Kadrioru koertepark', activeDogs: 2, planned: { morning: 0, day: 1, evening: 4 }, friends: [{ firstName: 'Mari', part: 'evening' }] }],
};
const elevenIds = Array.from({ length: 11 }, (_, i) => `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`).join(',');

describe('GET /api/v1/parks/activity (M11)', () => {
  it('requires a session (401 before validation)', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/parks/activity?ids=nope' });
    expect(res.statusCode).toBe(401);
    expectApiError(res);
  });

  it('returns the activity for the requested parks', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    ctx.parkActivity.today.mockResolvedValue(body);
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/parks/activity?ids=${OTHER},${PARK_ID}`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(body);
    expect(ctx.parkActivity.today).toHaveBeenCalledWith(USER_ID, [OTHER, PARK_ID]);
  });

  it('is not shadowed by GET /parks/:parkId', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    ctx.parkActivity.today.mockResolvedValue(body);
    await ctx.app.inject({ method: 'GET', url: `/api/v1/parks/activity?ids=${PARK_ID}`, headers: auth });
    expect(ctx.service.getPublicPark).not.toHaveBeenCalled();
  });

  it.each([
    ['missing ids', ''],
    ['empty ids', '?ids='],
    ['an id that is not a UUID', '?ids=42'],
    ['more than ten ids', `?ids=${elevenIds}`],
  ])('400 for %s', async (_name, query) => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/parks/activity${query}`, headers: auth });
    expect(res.statusCode).toBe(400);
    expectApiError(res, /"ids"/);
    expect(ctx.parkActivity.today).not.toHaveBeenCalled();
  });

  it('translates the validation message (Accept-Language: en)', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/parks/activity?ids=42', headers: { ...auth, 'accept-language': 'en' } });
    expect(res.statusCode).toBe(400);
    expectApiError(res, /park ids/);
  });

  it('503 when the service times out', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    ctx.parkActivity.today.mockRejectedValue(new TimeoutError('parkActivity.visiblePlans', 8000));
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/parks/activity?ids=${PARK_ID}`, headers: auth });
    expect(res.statusCode).toBe(503);
    expectApiError(res);
  });
});
