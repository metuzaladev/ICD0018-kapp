import { afterEach, describe, expect, it } from 'vitest';

import { ConflictError, ForbiddenError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import { buildTestApp, fakeAuth, PARK_ID, USER_ID } from '../helpers';
import { expectApiError } from './expect-api-error';

let ctx: Awaited<ReturnType<typeof buildTestApp>> | undefined;
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

const auth = { authorization: 'Bearer test' };
const DOG_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const later = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const app = async () => (ctx = await buildTestApp({ resolveUserId: fakeAuth }));

describe('auth is required', () => {
  it.each([
    ['GET', '/api/v1/me/dogs'],
    ['POST', '/api/v1/me/dogs'],
    ['POST', '/api/v1/me/check-ins'],
    ['GET', '/api/v1/me/check-ins/active'],
    ['GET', `/api/v1/parks/${PARK_ID}/visitors`],
    ['GET', '/api/v1/me/visits'],
    ['POST', '/api/v1/me/planned-visits'],
    ['PUT', `/api/v1/parks/${PARK_ID}/reviews/mine`],
    ['POST', `/api/v1/parks/${PARK_ID}/reports`],
  ] as const)('%s %s → 401', async (method, url) => {
    await app();
    const res = await ctx!.app.inject({ method, url, payload: method === 'GET' ? undefined : {} });
    expect(res.statusCode).toBe(401);
    expectApiError(res);
  });
});

describe('dogs', () => {
  it('201 and the session owner is used', async () => {
    await app();
    ctx!.dogs.create.mockResolvedValue({ id: DOG_ID, name: 'Freddy' });
    const res = await ctx!.app.inject({ method: 'POST', url: '/api/v1/me/dogs', headers: auth, payload: { name: ' Freddy ' } });
    expect(res.statusCode).toBe(201);
    expect(ctx!.dogs.create).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ name: 'Freddy', breed: null }));
  });

  it.each([
    ['null name', { name: null }],
    ['owner smuggled in', { name: 'X', ownerId: 'someone-else' }],
    ['weight as text', { name: 'X', weightKg: '12' }],
  ])('400 for %s', async (_case, payload) => {
    await app();
    const res = await ctx!.app.inject({ method: 'POST', url: '/api/v1/me/dogs', headers: auth, payload });
    expect(res.statusCode).toBe(400);
    expectApiError(res);
  });

  it('400 for a non-UUID dog id and 409 at the limit', async () => {
    await app();
    const bad = await ctx!.app.inject({ method: 'DELETE', url: '/api/v1/me/dogs/abc', headers: auth });
    expect(bad.statusCode).toBe(400);
    ctx!.dogs.create.mockRejectedValue(new ConflictError('errors.dogLimit', { max: 10 }));
    const full = await ctx!.app.inject({ method: 'POST', url: '/api/v1/me/dogs', headers: auth, payload: { name: 'X' } });
    expect(full.statusCode).toBe(409);
    expectApiError(full, 'Kuni 10 koera');
  });
});

describe('check-ins', () => {
  it.each([
    ['no body', undefined, 'Päringu sisu puudub'],
    ['empty dog list', { parkId: PARK_ID, dogIds: [] }, /dogIds|koer/],
    ['same dog twice', { parkId: PARK_ID, dogIds: [DOG_ID, DOG_ID] }, /dogIds|kaks korda/],
    ['3-hour+ duration', { parkId: PARK_ID, dogIds: [DOG_ID], durationMinutes: 500 }, /durationMinutes/],
    ['bad park id', { parkId: 'kadriorg', dogIds: [DOG_ID] }, /parkId/],
  ])('400 for %s', async (_case, payload, message) => {
    await app();
    const res = await ctx!.app.inject({ method: 'POST', url: '/api/v1/me/check-ins', headers: auth, payload: payload as object });
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
    expect(ctx!.visits.checkIn).not.toHaveBeenCalled();
  });

  it('201 on success, 409 on a concurrent check-in, 503 on timeout', async () => {
    await app();
    const payload = { parkId: PARK_ID, dogIds: [DOG_ID] };
    ctx!.visits.checkIn
      .mockResolvedValueOnce({ id: 'c1' })
      .mockRejectedValueOnce(new ConflictError())
      .mockRejectedValueOnce(new TimeoutError('visits.createCheckIn', 8000));
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await ctx!.app.inject({ method: 'POST', url: '/api/v1/me/check-ins', headers: auth, payload })).statusCode);
    }
    expect(statuses).toEqual([201, 409, 503]);
  });

  it('active check-in: 200 with JSON null when not in a park', async () => {
    await app();
    ctx!.visits.getActive.mockResolvedValue(null);
    const res = await ctx!.app.inject({ method: 'GET', url: '/api/v1/me/check-ins/active', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });

  it('end: 204, and 400 for a bad id', async () => {
    await app();
    ctx!.visits.endCheckIn.mockResolvedValue(undefined);
    const ok = await ctx!.app.inject({ method: 'POST', url: `/api/v1/me/check-ins/${PARK_ID}/end`, headers: auth });
    expect(ok.statusCode).toBe(204);
    const bad = await ctx!.app.inject({ method: 'POST', url: '/api/v1/me/check-ins/x/end', headers: auth });
    expect(bad.statusCode).toBe(400);
  });
});

describe('planned visits', () => {
  it('400 for a start in the past with the field named', async () => {
    await app();
    const res = await ctx!.app.inject({
      method: 'POST',
      url: '/api/v1/me/planned-visits',
      headers: auth,
      payload: { parkId: PARK_ID, startsAt: later(-120), endsAt: later(-60) },
    });
    expect(res.statusCode).toBe(400);
    expectApiError(res, /startsAt.*minevikus/);
  });

  it('201 for a valid plan', async () => {
    await app();
    ctx!.visits.planVisit.mockResolvedValue({ id: 'p1' });
    const res = await ctx!.app.inject({
      method: 'POST',
      url: '/api/v1/me/planned-visits',
      headers: auth,
      payload: { parkId: PARK_ID, startsAt: later(60), endsAt: later(120), note: '' },
    });
    expect(res.statusCode).toBe(201);
    expect(ctx!.visits.planVisit).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ note: null }));
  });
});

describe('reviews & reports', () => {
  it('reviews list is public', async () => {
    await app();
    ctx!.reviews.list.mockResolvedValue([]);
    const res = await ctx!.app.inject({ method: 'GET', url: `/api/v1/parks/${PARK_ID}/reviews` });
    expect(res.statusCode).toBe(200);
    expect(ctx!.reviews.list).toHaveBeenCalledWith(PARK_ID, undefined);
  });

  it.each([0, 6, 3.5])('400 for rating %s', async (rating) => {
    await app();
    const res = await ctx!.app.inject({ method: 'PUT', url: `/api/v1/parks/${PARK_ID}/reviews/mine`, headers: auth, payload: { rating } });
    expect(res.statusCode).toBe(400);
  });

  it('403 is passed through when the user has not visited', async () => {
    await app();
    ctx!.reviews.submit.mockRejectedValue(new ForbiddenError('errors.reviewNeedsVisit'));
    const res = await ctx!.app.inject({ method: 'PUT', url: `/api/v1/parks/${PARK_ID}/reviews/mine`, headers: auth, payload: { rating: 5 } });
    expect(res.statusCode).toBe(403);
    expectApiError(res, 'külastanud');
  });

  it('report: 400 for a too short description, 201 otherwise', async () => {
    await app();
    const short = await ctx!.app.inject({ method: 'POST', url: `/api/v1/parks/${PARK_ID}/reports`, headers: auth, payload: { description: 'katki' } });
    expect(short.statusCode).toBe(400);
    expectApiError(short, /vähemalt 10/);
    ctx!.reports.reportPark.mockResolvedValue({ id: 'r1' });
    const ok = await ctx!.app.inject({
      method: 'POST',
      url: `/api/v1/parks/${PARK_ID}/reports`,
      headers: auth,
      payload: { description: 'Värava lukk on katki' },
    });
    expect(ok.statusCode).toBe(201);
  });
});
