import { afterEach, describe, expect, it } from 'vitest';

import { NotFoundError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import { buildTestApp, fakeAuth, makePark, PARK_ID, USER_ID } from '../helpers';
import { expectApiError } from './expect-api-error';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;
let ctx: TestApp | undefined;

afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

const auth = { authorization: 'Bearer test' };
const validBody = { name: 'Uus park', lat: 59.4, lng: 24.7 };


describe('GET /api/v1/parks/nearby', () => {
  it('returns parks from the service', async () => {
    ctx = await buildTestApp();
    ctx.service.listNearby.mockResolvedValue([makePark({ distanceKm: 2.2 })]);

    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/parks/nearby?lat=59.437&lng=24.75' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([makePark({ distanceKm: 2.2 })]);
    expect(ctx.service.listNearby).toHaveBeenCalledWith({ lat: 59.437, lng: 24.75, radiusKm: 5 });
  });

  it.each([
    ['missing coordinates', '', /"lat"/],
    ['non-numeric latitude', '?lat=abc&lng=24.7', /"lat"/],
    ['radius above the limit', '?lat=59&lng=24&radiusKm=500', /"radiusKm"/],
  ])('400 for %s', async (_case, qs, message) => {
    ctx = await buildTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/parks/nearby${qs}` });
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
    expect(ctx.service.listNearby).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/parks/nearby filters', () => {
  it('parses feature flags from the query string', async () => {
    ctx = await buildTestApp();
    await ctx.app.inject({ method: 'GET', url: '/api/v1/parks/nearby?lat=59&lng=24&water=true&lighting=false' });
    expect(ctx.service.listNearby).toHaveBeenCalledWith(
      expect.objectContaining({ water: true, lighting: false, radiusKm: 5 }),
    );
  });

  it('400 for a flag that is not a boolean', async () => {
    ctx = await buildTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/parks/nearby?lat=59&lng=24&water=maybe' });
    expect(res.statusCode).toBe(400);
    expectApiError(res, /"water"/);
  });
});

describe('GET /api/v1/parks/:parkId', () => {
  it('is public and passes no viewer for anonymous requests', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/parks/${PARK_ID}` });
    expect(res.statusCode).toBe(200);
    expect(ctx.service.getPublicPark).toHaveBeenCalledWith(PARK_ID, undefined);
  });

  it('passes the signed-in viewer so favourite state can be shown', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    await ctx.app.inject({ method: 'GET', url: `/api/v1/parks/${PARK_ID}`, headers: { authorization: 'Bearer test' } });
    expect(ctx.service.getPublicPark).toHaveBeenCalledWith(PARK_ID, USER_ID);
  });

  it('400 for an id that is not a UUID', async () => {
    ctx = await buildTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/parks/12345' });
    expect(res.statusCode).toBe(400);
    expectApiError(res, /"parkId"/);
  });

  it('404 when the service does not find the park', async () => {
    ctx = await buildTestApp();
    ctx.service.getPublicPark.mockRejectedValue(new NotFoundError('Parki ei leitud'));
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/parks/${PARK_ID}` });
    expect(res.statusCode).toBe(404);
    expectApiError(res, 'Parki ei leitud');
  });

  it('503 when the service times out', async () => {
    ctx = await buildTestApp();
    ctx.service.getPublicPark.mockRejectedValue(new TimeoutError('parks.findById', 8000));
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/parks/${PARK_ID}` });
    expect(res.statusCode).toBe(503);
    expectApiError(res);
  });

  it('500 without internal details for an unexpected error', async () => {
    ctx = await buildTestApp();
    ctx.service.getPublicPark.mockRejectedValue(new Error('select * from "user" — secret'));
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/parks/${PARK_ID}` });
    expect(res.statusCode).toBe(500);
    expectApiError(res);
    expect(res.body).not.toContain('secret');
  });
});

describe('POST /api/v1/parks', () => {
  it('401 without a signed-in user and never calls the service', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/parks', payload: validBody });
    expect(res.statusCode).toBe(401);
    expectApiError(res);
    expect(ctx.service.suggestPark).not.toHaveBeenCalled();
  });

  it('401 by default while authentication is not wired up', async () => {
    ctx = await buildTestApp();
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/parks', headers: auth, payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it('201 with Location header for a valid suggestion', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/parks',
      headers: auth,
      payload: { ...validBody, name: '  Uus park  ' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/parks/${PARK_ID}`);
    expect(ctx.service.suggestPark).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ name: 'Uus park', description: null, fenced: false }),
    );
  });

  it.each([
    ['no body at all', {}, 'Päringu sisu puudub', 400],
    ['empty JSON body', { headers: { 'content-type': 'application/json' }, payload: '' }, 'Päringu sisu puudub', 400],
    ['malformed JSON', { headers: { 'content-type': 'application/json' }, payload: '{"name":' }, 'korrektne JSON', 400],
    ['JSON null', { headers: { 'content-type': 'application/json' }, payload: 'null' }, 'Päringu sisu puudub', 400],
    ['non-JSON content type', { headers: { 'content-type': 'text/plain' }, payload: 'hello' }, 'application/json', 415],
  ])('rejects %s', async (_case, request, message, status) => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/parks',
      ...request,
      headers: { ...auth, ...(request as { headers?: Record<string, string> }).headers },
    });
    expect(res.statusCode).toBe(status);
    expectApiError(res, message);
    expect(ctx.service.suggestPark).not.toHaveBeenCalled();
  });

  it.each([
    ['null name', { ...validBody, name: null }, /"name"/],
    ['string latitude', { ...validBody, lat: '59.4' }, /"lat"/],
    ['server-owned field', { ...validBody, status: 'approved' }, /Tundmatud väljad: status/],
    ['name too long', { ...validBody, name: 'x'.repeat(81) }, /"name"/],
    ['array instead of object', [validBody], /body|puudub või on vale tüüpi/],
  ])('400 for %s', async (_case, payload, message) => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/parks', headers: auth, payload });
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
    expect(ctx.service.suggestPark).not.toHaveBeenCalled();
  });

  it('413 for a body over the size limit', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth }, { bodyLimitBytes: 100 });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/parks',
      headers: auth,
      payload: { ...validBody, description: 'x'.repeat(500) },
    });
    expect(res.statusCode).toBe(413);
    expectApiError(res);
  });
});

describe('cross-cutting', () => {
  it('404 in the standard shape for unknown routes', async () => {
    ctx = await buildTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expectApiError(res);
  });

  it('429 in the standard shape when the rate limit is exceeded', async () => {
    ctx = await buildTestApp({}, { rateLimitMax: 2 });
    const url = '/api/v1/parks/nearby?lat=59&lng=24';
    await ctx.app.inject({ method: 'GET', url });
    await ctx.app.inject({ method: 'GET', url });
    const res = await ctx.app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(429);
    expectApiError(res);
  });

  it('health reports a database outage without failing', async () => {
    ctx = await buildTestApp({
      checkDatabase: async () => {
        throw new Error('down');
      },
    });
    const res = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', database: 'down' });
  });

  it('sets security headers', async () => {
    ctx = await buildTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
