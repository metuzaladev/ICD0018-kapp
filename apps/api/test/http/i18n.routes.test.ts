import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, NotFoundError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import { buildTestApp, fakeAuth, PARK_ID } from '../helpers';
import { expectApiError } from './expect-api-error';

/**
 * Error messages follow Accept-Language end to end (et default, en, ru) while the shape stays
 * exactly `{ error: true, message }`. Data responses are not translated.
 */

let ctx: Awaited<ReturnType<typeof buildTestApp>> | undefined;
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

const ru = { 'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8' };
const en = { 'accept-language': 'en-GB,en;q=0.9' };

describe('Accept-Language on API errors', () => {
  it('defaults to Estonian without the header and for unsupported languages', async () => {
    ctx = await buildTestApp();
    const none = await ctx.app.inject({ method: 'GET', url: '/api/v1/parks/12345' });
    const german = await ctx.app.inject({ method: 'GET', url: '/api/v1/parks/12345', headers: { 'accept-language': 'de-DE' } });
    expectApiError(none, 'Väli "parkId" on vales vormingus');
    expectApiError(german, 'Väli "parkId" on vales vormingus');
  });

  it.each([
    [en, 'Field "parkId" has an invalid format'],
    [ru, 'Поле "parkId" в неверном формате'],
  ])('translates validation errors (%o)', async (headers, message) => {
    ctx = await buildTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/parks/12345', headers });
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
  });

  it.each([
    [en, 'Park not found'],
    [ru, 'Парк не найден'],
  ])('translates errors thrown by a service (%o)', async (headers, message) => {
    ctx = await buildTestApp();
    ctx.service.getPublicPark.mockRejectedValue(new NotFoundError('errors.parkNotFound'));
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/parks/${PARK_ID}`, headers });
    expect(res.statusCode).toBe(404);
    expectApiError(res, message);
  });

  it('translates errors with params', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    ctx.dogs.create.mockRejectedValue(new ConflictError('errors.dogLimit', { max: 10 }));
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/me/dogs',
      headers: { ...ru, authorization: 'Bearer test' },
      payload: { name: 'Freddy' },
    });
    expect(res.statusCode).toBe(409);
    expectApiError(res, 'Не более 10 собак на пользователя');
  });

  it.each([
    [en, 'Please sign in'],
    [ru, 'Пожалуйста, войдите в аккаунт'],
  ])('translates 401 (%o)', async (headers, message) => {
    ctx = await buildTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/me', headers });
    expect(res.statusCode).toBe(401);
    expectApiError(res, message);
  });

  it('translates 503, 404 for unknown routes and Fastify parser errors', async () => {
    ctx = await buildTestApp();
    ctx.service.getPublicPark.mockRejectedValue(new TimeoutError('parks.findById', 8000));
    const slow = await ctx.app.inject({ method: 'GET', url: `/api/v1/parks/${PARK_ID}`, headers: en });
    const missing = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope', headers: ru });
    const badJson = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/parks',
      headers: { ...en, 'content-type': 'application/json' },
      payload: '{oops',
    });
    expectApiError(slow, 'The service is not responding, please try again in a moment');
    expectApiError(missing, 'Такого адреса нет');
    expect(badJson.statusCode).toBe(400);
    expectApiError(badJson, 'The request body is not valid JSON');
  });

  it('translates the rate limit response', async () => {
    ctx = await buildTestApp({}, { rateLimitMax: 1 });
    const url = '/api/v1/parks/nearby?lat=59&lng=24';
    await ctx.app.inject({ method: 'GET', url });
    const res = await ctx.app.inject({ method: 'GET', url, headers: ru });
    expect(res.statusCode).toBe(429);
    expectApiError(res, 'Слишком много запросов, попробуйте чуть позже');
  });

  it('translates Better Auth errors in the auth proxy', async () => {
    const handler = vi.fn(async () => Response.json({ code: 'INVALID_EMAIL_OR_PASSWORD' }, { status: 401 }));
    ctx = await buildTestApp({ authHandler: handler });
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/sign-in/email', headers: en, payload: {} });
    expect(res.statusCode).toBe(401);
    expectApiError(res, 'Wrong email or password');
  });
});
