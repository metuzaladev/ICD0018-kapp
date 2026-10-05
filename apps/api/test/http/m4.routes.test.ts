import { afterEach, describe, expect, it } from 'vitest';

import { BadRequestError, ConflictError, NotFoundError, ServiceUnavailableError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import { buildTestApp, fakeAuth, USER_ID } from '../helpers';
import { expectApiError } from './expect-api-error';

let ctx: Awaited<ReturnType<typeof buildTestApp>> | undefined;
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

const auth = { authorization: 'Bearer test' };
const DOG_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const PHOTO_ID = '1c6b1c3e-0f7a-4c4e-9a59-3f4f0c1d2e3f';
const RECORD_ID = '6f1b2a3c-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const UPLOAD_KEY = `uploads/${USER_ID}/0b7e6a2c-1d3f-4e5a-8b9c-0d1e2f3a4b5c`;
const app = async () => (ctx = await buildTestApp({ resolveUserId: fakeAuth }));
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
const call = (method: Method, url: string, payload?: unknown) =>
  ctx!.app.inject({ method, url: `/api/v1${url}`, headers: auth, payload: payload as object });

const validRecord = { kind: 'vaccination', title: 'Marutaud', date: '2026-03-01', nextDue: '2027-03-01' };

describe('auth is required (401 before any validation)', () => {
  it.each([
    ['POST', `/me/dogs/${DOG_ID}/photos/uploads`],
    ['POST', `/me/dogs/${DOG_ID}/photos`],
    ['GET', `/me/dogs/${DOG_ID}/photos`],
    ['DELETE', `/me/dogs/${DOG_ID}/photos/${PHOTO_ID}`],
    ['PUT', `/me/dogs/${DOG_ID}/profile-photo`],
    ['GET', `/me/dogs/${DOG_ID}/health-records`],
    ['POST', `/me/dogs/${DOG_ID}/health-records`],
    ['PATCH', `/me/dogs/${DOG_ID}/health-records/${RECORD_ID}`],
    ['DELETE', `/me/dogs/${DOG_ID}/health-records/${RECORD_ID}`],
    ['GET', '/me/health-reminders'],
    // invalid ids too: anonymous clients learn nothing about the schema
    ['GET', '/me/dogs/not-a-uuid/photos'],
  ] as const)('%s %s → 401', async (method, url) => {
    await app();
    const res = await ctx!.app.inject({ method, url: `/api/v1${url}`, payload: method === 'GET' || method === 'DELETE' ? undefined : {} });
    expect(res.statusCode).toBe(401);
    expectApiError(res, 'Palun logi sisse');
  });
});

describe('invalid ids → 400 with the field named', () => {
  it.each([
    ['POST', '/me/dogs/abc/photos/uploads', { contentType: 'image/jpeg', byteSize: 1 }, 'dogId'],
    ['POST', '/me/dogs/abc/photos', { uploadKey: UPLOAD_KEY }, 'dogId'],
    ['GET', '/me/dogs/abc/photos', undefined, 'dogId'],
    ['DELETE', `/me/dogs/${DOG_ID}/photos/abc`, undefined, 'photoId'],
    ['PUT', '/me/dogs/abc/profile-photo', { photoId: null }, 'dogId'],
    ['GET', '/me/dogs/abc/health-records', undefined, 'dogId'],
    ['POST', '/me/dogs/abc/health-records', validRecord, 'dogId'],
    ['PATCH', `/me/dogs/${DOG_ID}/health-records/abc`, { title: 'X' }, 'recordId'],
    ['DELETE', `/me/dogs/abc/health-records/${RECORD_ID}`, undefined, 'dogId'],
  ] as const)('%s %s', async (method, url, payload, field) => {
    await app();
    const res = await call(method, url, payload);
    expect(res.statusCode).toBe(400);
    expectApiError(res, new RegExp(`"${field}"`));
  });
});

describe('POST /me/dogs/:dogId/photos/uploads', () => {
  const url = `/me/dogs/${DOG_ID}/photos/uploads`;

  it('201 with the presigned upload', async () => {
    await app();
    const upload = { uploadKey: UPLOAD_KEY, url: 'https://storage.test/x', headers: { 'Content-Type': 'image/jpeg' }, expiresAt: 'x' };
    ctx!.photos.createUpload.mockResolvedValue(upload);
    const res = await call('POST', url, { contentType: 'image/jpeg', byteSize: 2_000_000 });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(upload);
    expect(ctx!.photos.createUpload).toHaveBeenCalledWith(USER_ID, DOG_ID, { contentType: 'image/jpeg', byteSize: 2_000_000 });
  });

  it.each([
    ['no body', undefined, 'Päringu sisu puudub'],
    ['null body', null, 'Päringu sisu puudub'],
    ['null contentType', { contentType: null, byteSize: 1 }, /contentType/],
    ['GIF', { contentType: 'image/gif', byteSize: 1 }, /JPEG, PNG, WebP ja HEIC/],
    ['SVG', { contentType: 'image/svg+xml', byteSize: 1 }, /contentType/],
    ['size as text', { contentType: 'image/jpeg', byteSize: '100' }, /byteSize/],
    ['zero bytes', { contentType: 'image/jpeg', byteSize: 0 }, /byteSize/],
    ['fractional bytes', { contentType: 'image/jpeg', byteSize: 1.5 }, /byteSize/],
    ['over 10 MB', { contentType: 'image/jpeg', byteSize: 10 * 1024 * 1024 + 1 }, /kuni 10 MB/],
    ['a smuggled key', { contentType: 'image/jpeg', byteSize: 1, uploadKey: 'uploads/other/x' }, /Tundmatud väljad: uploadKey/],
  ])('400 for %s', async (_case, payload, message) => {
    await app();
    const res = await call('POST', url, payload);
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
    expect(ctx!.photos.createUpload).not.toHaveBeenCalled();
  });

  it('404 / 409 / 503 from the service keep the error shape', async () => {
    await app();
    ctx!.photos.createUpload
      .mockRejectedValueOnce(new NotFoundError('Koera ei leitud'))
      .mockRejectedValueOnce(new ConflictError('Kuni 50 fotot koera kohta'))
      .mockRejectedValueOnce(new ServiceUnavailableError('Pildihoidla ei vasta, proovi hetke pärast uuesti'))
      .mockRejectedValueOnce(new TimeoutError('storage.presignPut', 8000));
    const payload = { contentType: 'image/png', byteSize: 10 };
    const results = [];
    for (let i = 0; i < 4; i++) {
      const res = await call('POST', url, payload);
      expectApiError(res);
      results.push([res.statusCode, res.json().message]);
    }
    expect(results).toEqual([
      [404, 'Koera ei leitud'],
      [409, 'Kuni 50 fotot koera kohta'],
      [503, 'Pildihoidla ei vasta, proovi hetke pärast uuesti'],
      [503, 'Teenus ei vasta, proovi hetke pärast uuesti'],
    ]);
  });

  it('is rate limited more strictly than the global limit', async () => {
    await app();
    ctx!.photos.createUpload.mockResolvedValue({});
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await call('POST', url, { contentType: 'image/png', byteSize: 10 })).statusCode;
    expect(last).toBe(429);
  });
});

describe('POST /me/dogs/:dogId/photos', () => {
  const url = `/me/dogs/${DOG_ID}/photos`;

  it('201 with the photo; empty caption becomes null', async () => {
    await app();
    ctx!.photos.addPhoto.mockResolvedValue({ id: PHOTO_ID });
    const res = await call('POST', url, { uploadKey: UPLOAD_KEY, caption: '  ' });
    expect(res.statusCode).toBe(201);
    expect(ctx!.photos.addPhoto).toHaveBeenCalledWith(USER_ID, DOG_ID, { uploadKey: UPLOAD_KEY, caption: null });
  });

  it.each([
    ['no body', undefined, 'Päringu sisu puudub'],
    ['null uploadKey', { uploadKey: null }, /uploadKey/],
    ['a path traversal key', { uploadKey: `uploads/${USER_ID}/../../dogs/x` }, /vigane üleslaadimise võti/],
    ['a key outside uploads/', { uploadKey: `dogs/${DOG_ID}/${PHOTO_ID}/full.webp` }, /vigane üleslaadimise võti/],
    ['too long caption', { uploadKey: UPLOAD_KEY, caption: 'x'.repeat(201) }, /caption/],
  ])('400 for %s', async (_case, payload, message) => {
    await app();
    const res = await call('POST', url, payload);
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
  });

  it('400 (not an image / too large), 404 (foreign key), 503 (storage) pass through', async () => {
    await app();
    ctx!.photos.addPhoto
      .mockRejectedValueOnce(new BadRequestError('Faili ei saanud pildina lugeda, proovi JPEG- või PNG-pildiga'))
      .mockRejectedValueOnce(new NotFoundError('Üleslaaditud pilti ei leitud, proovi uuesti'))
      .mockRejectedValueOnce(new ServiceUnavailableError('Pildihoidla ei vasta, proovi hetke pärast uuesti'));
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const res = await call('POST', url, { uploadKey: UPLOAD_KEY });
      expectApiError(res);
      statuses.push(res.statusCode);
    }
    expect(statuses).toEqual([400, 404, 503]);
  });

  it('an unexpected error is a 500 without internals', async () => {
    await app();
    ctx!.photos.addPhoto.mockRejectedValue(new Error('vips: /tmp/secret/path failed'));
    const res = await call('POST', url, { uploadKey: UPLOAD_KEY });
    expect(res.statusCode).toBe(500);
    expectApiError(res, 'Serveri viga, proovi hiljem uuesti');
    expect(res.body).not.toContain('secret');
  });
});

describe('GET /me/dogs/:dogId/photos and DELETE …/:photoId', () => {
  it('200 with the list (may be empty)', async () => {
    await app();
    ctx!.photos.list.mockResolvedValue([]);
    const res = await call('GET', `/me/dogs/${DOG_ID}/photos`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    expect(ctx!.photos.list).toHaveBeenCalledWith(USER_ID, DOG_ID);
  });

  it('404 for a foreign dog, 503 on timeout', async () => {
    await app();
    ctx!.photos.list.mockRejectedValueOnce(new NotFoundError('Koera ei leitud')).mockRejectedValueOnce(new TimeoutError('photos.list', 8000));
    expect((await call('GET', `/me/dogs/${DOG_ID}/photos`)).statusCode).toBe(404);
    expect((await call('GET', `/me/dogs/${DOG_ID}/photos`)).statusCode).toBe(503);
  });

  it('DELETE → 204 with an empty body, 404 when the photo is not there', async () => {
    await app();
    ctx!.photos.remove.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new NotFoundError('Fotot ei leitud'));
    const ok = await call('DELETE', `/me/dogs/${DOG_ID}/photos/${PHOTO_ID}`);
    expect(ok.statusCode).toBe(204);
    expect(ok.body).toBe('');
    expect(ctx!.photos.remove).toHaveBeenCalledWith(USER_ID, DOG_ID, PHOTO_ID);
    const missing = await call('DELETE', `/me/dogs/${DOG_ID}/photos/${PHOTO_ID}`);
    expect(missing.statusCode).toBe(404);
    expectApiError(missing, 'Fotot ei leitud');
  });
});

describe('PUT /me/dogs/:dogId/profile-photo', () => {
  const url = `/me/dogs/${DOG_ID}/profile-photo`;

  it('200 with the dog; null is a valid value (removes the picture)', async () => {
    await app();
    ctx!.photos.setProfilePhoto.mockResolvedValue({ id: DOG_ID, profilePhoto: null });
    const res = await call('PUT', url, { photoId: null });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ profilePhoto: null });
    expect(ctx!.photos.setProfilePhoto).toHaveBeenCalledWith(USER_ID, DOG_ID, null);
  });

  it.each([
    ['no body', undefined, 'Päringu sisu puudub'],
    ['missing photoId', {}, /photoId/],
    ['bad photoId', { photoId: 'abc' }, /photoId/],
    ['extra field', { photoId: null, url: 'https://evil' }, /Tundmatud väljad: url/],
  ])('400 for %s', async (_case, payload, message) => {
    await app();
    const res = await call('PUT', url, payload);
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
  });

  it('404 for a photo of another dog', async () => {
    await app();
    ctx!.photos.setProfilePhoto.mockRejectedValue(new NotFoundError('Fotot ei leitud'));
    const res = await call('PUT', url, { photoId: PHOTO_ID });
    expect(res.statusCode).toBe(404);
    expectApiError(res, 'Fotot ei leitud');
  });
});

describe('health records', () => {
  const list = `/me/dogs/${DOG_ID}/health-records`;
  const one = `${list}/${RECORD_ID}`;

  it('GET 200 and POST 201 with optional fields normalised to null', async () => {
    await app();
    ctx!.health.list.mockResolvedValue([]);
    expect((await call('GET', list)).statusCode).toBe(200);
    ctx!.health.create.mockResolvedValue({ id: RECORD_ID });
    const res = await call('POST', list, { ...validRecord, nextDue: null, clinic: '', notes: '  ' });
    expect(res.statusCode).toBe(201);
    expect(ctx!.health.create).toHaveBeenCalledWith(USER_ID, DOG_ID, { ...validRecord, nextDue: null, clinic: null, notes: null });
  });

  it.each([
    ['no body', undefined, 'Päringu sisu puudub'],
    ['null title', { ...validRecord, title: null }, /title/],
    ['empty title', { ...validRecord, title: '   ' }, /sisesta nimetus/],
    ['unknown kind', { ...validRecord, kind: 'surgery' }, /kind/],
    ['date in the future', { ...validRecord, date: '2999-01-01', nextDue: null }, /tulevikus/],
    ['date not ISO', { ...validRecord, date: '01.03.2026' }, /AAAA-KK-PP/],
    ['nextDue before date', { ...validRecord, nextDue: '2026-01-01' }, /"nextDue".*pärast kuupäeva/],
    ['dogId smuggled in', { ...validRecord, dogId: DOG_ID }, /Tundmatud väljad: dogId/],
  ])('POST 400 for %s', async (_case, payload, message) => {
    await app();
    const res = await call('POST', list, payload);
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
    expect(ctx!.health.create).not.toHaveBeenCalled();
  });

  it('PATCH 200; null clears nextDue, a missing field stays untouched', async () => {
    await app();
    ctx!.health.update.mockResolvedValue({ id: RECORD_ID });
    const res = await call('PATCH', one, { nextDue: null });
    expect(res.statusCode).toBe(200);
    expect(ctx!.health.update).toHaveBeenCalledWith(USER_ID, DOG_ID, RECORD_ID, { nextDue: null });
  });

  it.each([
    ['empty object', {}, 'Muuda vähemalt üht välja'],
    ['null title', { title: null }, /title/],
    ['unknown field', { createdAt: '2020-01-01' }, /Tundmatud väljad: createdAt/],
  ])('PATCH 400 for %s', async (_case, payload, message) => {
    await app();
    const res = await call('PATCH', one, payload);
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
  });

  it('PATCH passes the service 400 (nextDue vs stored date) and 404', async () => {
    await app();
    ctx!.health.update
      .mockRejectedValueOnce(new BadRequestError('Väli "nextDue" järgmine tähtaeg peab olema pärast kuupäeva'))
      .mockRejectedValueOnce(new NotFoundError('Tervisekirjet ei leitud'));
    expect((await call('PATCH', one, { nextDue: '2026-01-01' })).statusCode).toBe(400);
    expect((await call('PATCH', one, { title: 'X' })).statusCode).toBe(404);
  });

  it('DELETE 204, then 404', async () => {
    await app();
    ctx!.health.remove.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new NotFoundError('Tervisekirjet ei leitud'));
    expect((await call('DELETE', one)).statusCode).toBe(204);
    expect((await call('DELETE', one)).statusCode).toBe(404);
  });

  it("404 for someone else's dog and 503 on timeout", async () => {
    await app();
    ctx!.health.list.mockRejectedValueOnce(new NotFoundError('Koera ei leitud')).mockRejectedValueOnce(new TimeoutError('health.list', 8000));
    const foreign = await call('GET', list);
    expect(foreign.statusCode).toBe(404);
    expectApiError(foreign, 'Koera ei leitud');
    const slow = await call('GET', list);
    expect(slow.statusCode).toBe(503);
    expectApiError(slow, 'Teenus ei vasta, proovi hetke pärast uuesti');
  });

  it('GET /me/health-reminders 200 for the signed-in user', async () => {
    await app();
    ctx!.health.reminders.mockResolvedValue([]);
    const res = await call('GET', '/me/health-reminders');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    expect(ctx!.health.reminders).toHaveBeenCalledWith(USER_ID);
  });
});
