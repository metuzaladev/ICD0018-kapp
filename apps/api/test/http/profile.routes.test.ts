import { afterEach, describe, expect, it } from 'vitest';

import { TimeoutError } from '../../src/lib/timeout';
import { buildTestApp, fakeAuth, makeProfile, USER_ID } from '../helpers';
import { expectApiError } from './expect-api-error';

let ctx: Awaited<ReturnType<typeof buildTestApp>> | undefined;
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

const auth = { authorization: 'Bearer test' };

describe('GET /api/v1/me', () => {
  it('401 without a session', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(res.statusCode).toBe(401);
    expectApiError(res, 'Palun logi sisse');
    expect(ctx.profile.getOwnProfile).not.toHaveBeenCalled();
  });

  it('returns the profile of the session user only', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/me', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(makeProfile());
    expect(ctx.profile.getOwnProfile).toHaveBeenCalledWith(USER_ID);
  });

  it('503 when the profile lookup times out', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    ctx.profile.getOwnProfile.mockRejectedValue(new TimeoutError('profile.findById', 8000));
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/me', headers: auth });
    expect(res.statusCode).toBe(503);
    expectApiError(res);
  });

  it('503 (not 401) when the session store itself fails', async () => {
    ctx = await buildTestApp({
      resolveUserId: async () => {
        throw Object.assign(new Error('connect'), { code: 'ECONNREFUSED' });
      },
    });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/me', headers: auth });
    expect(res.statusCode).toBe(503);
  });
});

describe('PATCH /api/v1/me', () => {
  it('updates allowed fields and trims text', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: auth,
      payload: { name: '  Kristofer  ', bio: '', presenceSharing: 'nobody' },
    });
    expect(res.statusCode).toBe(200);
    expect(ctx.profile.updateOwnProfile).toHaveBeenCalledWith(USER_ID, {
      name: 'Kristofer',
      bio: null,
      presenceSharing: 'nobody',
    });
  });

  it.each([
    ['no body', undefined, 'Päringu sisu puudub'],
    ['empty object', {}, 'Muuda vähemalt üht välja'],
    ['null name', { name: null }, /"name"/],
    ['one-letter name', { name: 'K' }, /"name"/],
    ['unknown presence value', { presenceSharing: 'public' }, /"presenceSharing"/],
    ['email change attempt', { email: 'x@y.ee' }, 'Tundmatud väljad: email'],
    ['bio too long', { bio: 'x'.repeat(301) }, /"bio"/],
  ])('400 for %s', async (_case, payload, message) => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method: 'PATCH', url: '/api/v1/me', headers: auth, payload: payload as object });
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
    expect(ctx.profile.updateOwnProfile).not.toHaveBeenCalled();
  });

  it('401 before validation, so anonymous clients learn nothing about the schema', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method: 'PATCH', url: '/api/v1/me', payload: { email: 'x' } });
    expect(res.statusCode).toBe(401);
  });
});
