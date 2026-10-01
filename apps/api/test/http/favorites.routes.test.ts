import { afterEach, describe, expect, it } from 'vitest';

import { NotFoundError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import { buildTestApp, fakeAuth, makePark, PARK_ID, USER_ID } from '../helpers';
import { expectApiError } from './expect-api-error';

let ctx: Awaited<ReturnType<typeof buildTestApp>> | undefined;
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

const auth = { authorization: 'Bearer test' };
const url = `/api/v1/me/favorites/${PARK_ID}`;

describe('/api/v1/me/favorites', () => {
  it.each([
    ['GET', '/api/v1/me/favorites'],
    ['PUT', url],
    ['DELETE', url],
  ] as const)('%s requires a session', async (method, path) => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method, url: path });
    expect(res.statusCode).toBe(401);
    expectApiError(res);
  });

  it('lists favourites of the session user', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/me/favorites', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([makePark()]);
    expect(ctx.favorites.list).toHaveBeenCalledWith(USER_ID);
  });

  it('PUT adds and answers 204 with no body', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method: 'PUT', url, headers: auth });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect(ctx.favorites.add).toHaveBeenCalledWith(USER_ID, PARK_ID);
  });

  it('DELETE removes and answers 204', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method: 'DELETE', url, headers: auth });
    expect(res.statusCode).toBe(204);
    expect(ctx.favorites.remove).toHaveBeenCalledWith(USER_ID, PARK_ID);
  });

  it.each(['PUT', 'DELETE'] as const)('%s rejects an id that is not a UUID', async (method) => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method, url: '/api/v1/me/favorites/42', headers: auth });
    expect(res.statusCode).toBe(400);
    expectApiError(res, /"parkId"/);
  });

  it('404 when the park is not public', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    ctx.favorites.add.mockRejectedValue(new NotFoundError('Parki ei leitud'));
    const res = await ctx.app.inject({ method: 'PUT', url, headers: auth });
    expect(res.statusCode).toBe(404);
    expectApiError(res, 'Parki ei leitud');
  });

  it('503 on timeout', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    ctx.favorites.list.mockRejectedValue(new TimeoutError('favorites.listParks', 8000));
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/me/favorites', headers: auth });
    expect(res.statusCode).toBe(503);
  });
});
