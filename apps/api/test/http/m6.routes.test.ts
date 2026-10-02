import type { Booking, ProviderDetail, ServiceSlots } from '@kapp/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { ConflictError, NotFoundError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import { buildTestApp, fakeAuth, USER_ID } from '../helpers';
import { expectApiError } from './expect-api-error';

let ctx: Awaited<ReturnType<typeof buildTestApp>> | undefined;
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

const auth = { authorization: 'Bearer test' };
const PROVIDER = '0b6f6a52-3c1e-4c1b-9a37-2f1e5d4c3b2a';
const SERVICE = '1c7e7b63-4d2f-4d2c-8b48-3f2e6e5d4c3b';
const BOOKING = '2d8f8c74-5e3a-4e3d-9c59-4a3f7f6e5d4c';
const DOG = '3e9a9d85-6f4b-4f4e-8d6a-5b4a8a7f6e5d';
const START = '2026-10-06T07:00:00.000Z';

const app = async (config = {}) => (ctx = await buildTestApp({ resolveUserId: fakeAuth }, config));
const req = (method: 'GET' | 'POST', url: string, payload?: unknown, headers: Record<string, string> = {}) =>
  ctx!.app.inject({ method, url: `/api/v1${url}`, headers: { ...auth, ...headers }, payload: payload as object });

const booking: Booking = {
  id: BOOKING,
  status: 'confirmed',
  startsAt: START,
  endsAt: '2026-10-06T08:00:00.000Z',
  timeZone: 'Europe/Tallinn',
  note: null,
  priceCents: 3500,
  priceIsFrom: true,
  provider: { id: PROVIDER, name: 'Käpakoda', category: 'grooming', area: 'Kadriorg', address: null },
  service: { id: SERVICE, name: 'Pesu ja kammimine', durationMinutes: 60 },
  dogs: [{ id: DOG, name: 'Freddy' }],
  cancellable: true,
  cancelUntil: '2026-10-06T05:00:00.000Z',
  cancelledAt: null,
  createdAt: '2026-10-05T07:00:00.000Z',
};
const validBody = { serviceId: SERVICE, startsAt: START, dogIds: [DOG] };

describe('catalogue routes are public', () => {
  it('GET /service-providers without a session → 200 and passes the parsed query', async () => {
    await app();
    ctx!.providers.list.mockResolvedValue([]);
    const res = await ctx!.app.inject({ method: 'GET', url: '/api/v1/service-providers?category=vet&lat=59.4&lng=24.7&radiusKm=10' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    expect(ctx!.providers.list).toHaveBeenCalledWith({ category: 'vet', lat: 59.4, lng: 24.7, radiusKm: 10 });
  });

  it.each([
    ['unknown category', '?category=walking', /category/],
    ['lat without lng', '?lat=59.4', /lat/],
    ['lat not a number', '?lat=abc&lng=24.7', /lat/],
    ['radius too large', '?radiusKm=500', /radiusKm/],
  ])('GET /service-providers %s → 400', async (_label, query, message) => {
    await app();
    const res = await ctx!.app.inject({ method: 'GET', url: `/api/v1/service-providers${query}` });
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
    expect(ctx!.providers.list).not.toHaveBeenCalled();
  });

  it('GET /service-providers/:id → 200, invalid id → 400, unknown → 404', async () => {
    await app();
    ctx!.providers.getProvider
      .mockResolvedValueOnce({ id: PROVIDER, name: 'Käpakoda', services: [] } as unknown as ProviderDetail)
      .mockRejectedValueOnce(new NotFoundError('errors.providerNotFound'));
    expect((await ctx!.app.inject({ method: 'GET', url: `/api/v1/service-providers/${PROVIDER}` })).statusCode).toBe(200);
    const missing = await ctx!.app.inject({ method: 'GET', url: `/api/v1/service-providers/${PROVIDER}` });
    expect(missing.statusCode).toBe(404);
    expectApiError(missing, 'Teenusepakkujat ei leitud');
    const bad = await ctx!.app.inject({ method: 'GET', url: '/api/v1/service-providers/not-a-uuid' });
    expect(bad.statusCode).toBe(400);
    expectApiError(bad, /providerId/);
  });

  it('GET /services/:id/slots → 200 with defaults', async () => {
    await app();
    ctx!.providers.listSlots.mockResolvedValue({ serviceId: SERVICE, timeZone: 'Europe/Tallinn', days: [] } satisfies ServiceSlots);
    const res = await ctx!.app.inject({ method: 'GET', url: `/api/v1/services/${SERVICE}/slots` });
    expect(res.statusCode).toBe(200);
    expect(ctx!.providers.listSlots).toHaveBeenCalledWith(SERVICE, { days: 7 });
  });

  it.each([
    ['days 0', '?days=0', /days/],
    ['days 15', '?days=15', /days/],
    ['days not a number', '?days=many', /days/],
    ['bad date', '?from=06.10.2026', /AAAA-KK-PP/],
  ])('GET /services/:id/slots %s → 400', async (_label, query, message) => {
    await app();
    const res = await ctx!.app.inject({ method: 'GET', url: `/api/v1/services/${SERVICE}/slots${query}` });
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
  });

  it('slots: unknown service 404, invalid id 400, slow database 503', async () => {
    await app();
    ctx!.providers.listSlots
      .mockRejectedValueOnce(new NotFoundError('errors.serviceNotFound'))
      .mockRejectedValueOnce(new TimeoutError('providers.findFreeSlots', 8000));
    const missing = await ctx!.app.inject({ method: 'GET', url: `/api/v1/services/${SERVICE}/slots` });
    expect(missing.statusCode).toBe(404);
    expectApiError(missing, 'Teenust ei leitud');
    const slow = await ctx!.app.inject({ method: 'GET', url: `/api/v1/services/${SERVICE}/slots` });
    expect(slow.statusCode).toBe(503);
    expectApiError(slow, 'Teenus ei vasta, proovi hetke pärast uuesti');
    expect((await ctx!.app.inject({ method: 'GET', url: '/api/v1/services/123/slots' })).statusCode).toBe(400);
  });
});

describe('booking routes require a session', () => {
  it.each([
    ['GET', '/me/bookings'],
    ['POST', '/me/bookings'],
    ['GET', `/me/bookings/${BOOKING}`],
    ['POST', `/me/bookings/${BOOKING}/cancel`],
  ] as const)('%s %s → 401 before validation', async (method, url) => {
    await app();
    const res = await ctx!.app.inject({ method, url: `/api/v1${url}`, payload: method === 'POST' ? { junk: true } : undefined });
    expect(res.statusCode).toBe(401);
    expectApiError(res, 'Palun logi sisse');
  });
});

describe('POST /me/bookings', () => {
  it('201 with the booking; the user comes from the session', async () => {
    await app();
    ctx!.bookings.create.mockResolvedValue(booking);
    const res = await req('POST', '/me/bookings', { ...validBody, note: ' Esimene külastus ' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(booking);
    expect(ctx!.bookings.create).toHaveBeenCalledWith(USER_ID, { ...validBody, note: 'Esimene külastus' });
  });

  it.each([
    ['no body', undefined, 'Päringu sisu puudub'],
    ['null body', null, 'Päringu sisu puudub'],
    ['empty object', {}, /serviceId/],
    ['null serviceId', { ...validBody, serviceId: null }, /serviceId/],
    ['invalid serviceId', { ...validBody, serviceId: 'abc' }, /serviceId/],
    ['startsAt as number', { ...validBody, startsAt: 1_790_000_000 }, /startsAt/],
    ['startsAt without offset', { ...validBody, startsAt: '2026-10-06T10:00:00' }, /startsAt/],
    ['dogIds missing', { serviceId: SERVICE, startsAt: START }, /dogIds/],
    ['no dog chosen', { ...validBody, dogIds: [] }, /vali vähemalt üks koer/],
    ['four dogs', { ...validBody, dogIds: [DOG, SERVICE, PROVIDER, BOOKING] }, /kuni 3 koera/],
    ['same dog twice', { ...validBody, dogIds: [DOG, DOG] }, /kaks korda/],
    ['dog id as number', { ...validBody, dogIds: [1] }, /dogIds/],
    ['note too long', { ...validBody, note: 'x'.repeat(301) }, /kuni 300 märki/],
    ['server-owned field', { ...validBody, status: 'completed' }, /status/],
    ['price from the client', { ...validBody, priceCents: 0 }, /priceCents/],
  ])('%s → 400', async (_label, payload, message) => {
    await app();
    const res = await req('POST', '/me/bookings', payload);
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
    expect(ctx!.bookings.create).not.toHaveBeenCalled();
  });

  it('a form body is 415, malformed JSON 400', async () => {
    await app();
    const form = await ctx!.app.inject({
      method: 'POST',
      url: '/api/v1/me/bookings',
      headers: { ...auth, 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'serviceId=x',
    });
    expect(form.statusCode).toBe(415);
    const broken = await ctx!.app.inject({
      method: 'POST',
      url: '/api/v1/me/bookings',
      headers: { ...auth, 'content-type': 'application/json' },
      payload: '{"serviceId":',
    });
    expect(broken.statusCode).toBe(400);
    expectApiError(broken, 'Päringu sisu ei ole korrektne JSON');
  });

  it.each([
    [new NotFoundError('errors.serviceNotFound'), 404, 'Teenust ei leitud'],
    [new NotFoundError('errors.dogNotFound'), 404, 'Koera ei leitud'],
    [new ConflictError('errors.slotUnavailable'), 409, 'See aeg ei ole broneeritav, vali teine aeg'],
    [new ConflictError('errors.slotTaken'), 409, 'Keegi jõudis selle aja just broneerida, vali teine aeg'],
    [new TimeoutError('bookings.create', 8000), 503, 'Teenus ei vasta, proovi hetke pärast uuesti'],
  ])('service error %# → %i', async (error, status, message) => {
    await app();
    ctx!.bookings.create.mockRejectedValue(error);
    const res = await req('POST', '/me/bookings', validBody);
    expect(res.statusCode).toBe(status);
    expectApiError(res, message);
  });

  it('errors follow Accept-Language (en, ru)', async () => {
    await app();
    ctx!.bookings.create.mockRejectedValue(new ConflictError('errors.slotTaken'));
    expectApiError(await req('POST', '/me/bookings', validBody, { 'accept-language': 'en-GB' }), 'Someone just booked this time, please choose another');
    expectApiError(await req('POST', '/me/bookings', validBody, { 'accept-language': 'ru' }), 'Это время только что заняли, выберите другое');
    expectApiError(await req('POST', '/me/bookings', { ...validBody, dogIds: [] }, { 'accept-language': 'en' }), /choose at least one dog/);
  });

  it('is rate limited: the 21st booking within an hour → 429', async () => {
    await app({ rateLimitMax: 1000 });
    ctx!.bookings.create.mockResolvedValue(booking);
    for (let i = 0; i < 20; i++) expect((await req('POST', '/me/bookings', validBody)).statusCode).toBe(201);
    const limited = await req('POST', '/me/bookings', validBody);
    expect(limited.statusCode).toBe(429);
    expectApiError(limited, 'Liiga palju päringuid, proovi hetke pärast uuesti');
  });
});

describe('GET /me/bookings, GET /me/bookings/:id, POST …/cancel', () => {
  it('lists upcoming by default and past on request; unknown scope → 400', async () => {
    await app();
    ctx!.bookings.list.mockResolvedValue([booking]);
    expect((await req('GET', '/me/bookings')).json()).toEqual([booking]);
    expect(ctx!.bookings.list).toHaveBeenLastCalledWith(USER_ID, { scope: 'upcoming' });
    await req('GET', '/me/bookings?scope=past');
    expect(ctx!.bookings.list).toHaveBeenLastCalledWith(USER_ID, { scope: 'past' });
    const bad = await req('GET', '/me/bookings?scope=all');
    expect(bad.statusCode).toBe(400);
    expectApiError(bad, /scope/);
  });

  it('get: 200, foreign/missing 404, invalid id 400', async () => {
    await app();
    ctx!.bookings.get.mockResolvedValueOnce(booking).mockRejectedValueOnce(new NotFoundError('errors.bookingNotFound'));
    expect((await req('GET', `/me/bookings/${BOOKING}`)).statusCode).toBe(200);
    const missing = await req('GET', `/me/bookings/${BOOKING}`);
    expect(missing.statusCode).toBe(404);
    expectApiError(missing, 'Broneeringut ei leitud');
    expect((await req('GET', '/me/bookings/1')).statusCode).toBe(400);
  });

  it('cancel: 200 with the cancelled booking (also when repeated)', async () => {
    await app();
    const cancelled = { ...booking, status: 'cancelled' as const, cancellable: false, cancelledAt: '2026-10-05T08:00:00.000Z' };
    ctx!.bookings.cancel.mockResolvedValue(cancelled);
    for (let i = 0; i < 2; i++) {
      const res = await req('POST', `/me/bookings/${BOOKING}/cancel`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(cancelled);
    }
    expect(ctx!.bookings.cancel).toHaveBeenCalledWith(USER_ID, BOOKING);
  });

  it('cancel: too late 409 (with hours), foreign 404, invalid id 400, timeout 503', async () => {
    await app();
    ctx!.bookings.cancel
      .mockRejectedValueOnce(new ConflictError('errors.cancelTooLate', { hours: 2 }))
      .mockRejectedValueOnce(new NotFoundError('errors.bookingNotFound'))
      .mockRejectedValueOnce(new TimeoutError('bookings.cancel', 8000));
    const late = await req('POST', `/me/bookings/${BOOKING}/cancel`);
    expect(late.statusCode).toBe(409);
    expectApiError(late, 'Tühistada saab kuni 2 tundi enne algust');
    expect((await req('POST', `/me/bookings/${BOOKING}/cancel`)).statusCode).toBe(404);
    expect((await req('POST', `/me/bookings/${BOOKING}/cancel`)).statusCode).toBe(503);
    expect((await req('POST', '/me/bookings/xyz/cancel')).statusCode).toBe(400);
  });

  it('an unexpected error is a generic 500 without details', async () => {
    await app();
    ctx!.bookings.list.mockRejectedValue(new Error('SELECT * FROM bookings exploded'));
    const res = await req('GET', '/me/bookings');
    expect(res.statusCode).toBe(500);
    expectApiError(res, 'Serveri viga, proovi hiljem uuesti');
    expect(res.body).not.toContain('SELECT');
  });
});
