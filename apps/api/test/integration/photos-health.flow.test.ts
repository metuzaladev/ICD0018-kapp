/**
 * M4 end to end with real auth, Postgres and MinIO: presigned upload → processing (EXIF/GPS
 * stripped) → list → profile photo → delete, ownership checks between two users, health records
 * and reminders. Needs `npm run db:up` (MinIO + bucket) and migrations.
 */
import exifReader from 'exif-reader';
import { like, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db, pool } from '../../src/db/client';
import { user } from '../../src/db/schema';
import { makeCameraJpeg } from '../helpers';
import { buildRealApp, signUpAndGetCookie, testStorage } from './real-app';

const DOMAIN = '@photos-health.test.invalid';
let app: Awaited<ReturnType<typeof buildRealApp>>;
const owner = { cookie: '', id: '', dogId: '' };
const other = { cookie: '', id: '', dogId: '' };
const createdDogIds: string[] = [];

type Who = typeof owner;
const api = (who: Who, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${url}`, headers: { cookie: who.cookie }, payload });

/** YYYY-MM-DD in Tallinn, `offset` days from today — the same "today" the reminders use. */
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Tallinn' });

async function createDog(who: Who, name: string) {
  const res = await api(who, 'POST', '/me/dogs', { name });
  expect(res.statusCode).toBe(201);
  createdDogIds.push(res.json().id);
  return res.json().id as string;
}

/** Steps 1 and 2 of the flow, exactly as the app does them. */
async function uploadBytes(who: Who, dogId: string, bytes: Buffer, contentType = 'image/jpeg') {
  const res = await api(who, 'POST', `/me/dogs/${dogId}/photos/uploads`, { contentType, byteSize: bytes.length });
  expect(res.statusCode).toBe(201);
  const upload = res.json();
  const put = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: new Uint8Array(bytes) });
  expect(put.status).toBe(200);
  return upload.uploadKey as string;
}

async function addPhoto(who: Who, dogId: string, bytes: Buffer) {
  const uploadKey = await uploadBytes(who, dogId, bytes);
  return api(who, 'POST', `/me/dogs/${dogId}/photos`, { uploadKey, caption: 'Rannas' });
}

beforeAll(async () => {
  app = await buildRealApp();
  for (const [who, prefix] of [
    [owner, 'owner'],
    [other, 'other'],
  ] as const) {
    who.cookie = await signUpAndGetCookie(app, `${prefix}-${Date.now()}${DOMAIN}`);
    who.id = (await api(who, 'GET', '/me')).json().id;
    who.dogId = await createDog(who, prefix === 'owner' ? 'Freddy' : 'Muki');
  }
});

afterAll(async () => {
  await Promise.all([
    ...createdDogIds.map((id) => testStorage.removePrefix(`dogs/${id}/`)),
    testStorage.removePrefix(`uploads/${owner.id}/`),
    testStorage.removePrefix(`uploads/${other.id}/`),
  ]);
  await db.delete(user).where(like(user.email, `%${DOMAIN}`));
  await app.close();
  await pool.end();
});

describe('M4 photo flow', () => {
  let photo: { id: string; url: string; thumbnailUrl: string };
  let original: Buffer;

  it('rejects a PUT that differs from the declared size (Content-Length is signed)', async () => {
    const res = await api(owner, 'POST', `/me/dogs/${owner.dogId}/photos/uploads`, { contentType: 'image/jpeg', byteSize: 100 });
    const upload = res.json();
    const put = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: new Uint8Array(5000) });
    expect(put.status).toBe(403);
    expect(await testStorage.stat(upload.uploadKey)).toBeNull();
  });

  it('uploads, processes and returns signed URLs; the raw upload is deleted', async () => {
    original = await makeCameraJpeg(3000, 2000);
    expect(exifReader((await sharp(original).metadata()).exif!).GPSInfo?.GPSLatitude).toEqual([59, 26, 18]);

    const uploadKey = await uploadBytes(owner, owner.dogId, original);
    expect(uploadKey.startsWith(`uploads/${owner.id}/`)).toBe(true);
    const res = await api(owner, 'POST', `/me/dogs/${owner.dogId}/photos`, { uploadKey, caption: 'Rannas' });
    expect(res.statusCode).toBe(201);
    photo = res.json();
    expect(photo).toMatchObject({ caption: 'Rannas' });
    expect(await testStorage.stat(uploadKey)).toBeNull();
  });

  it('the stored image has no EXIF at all — the GPS position is gone — and is resized', async () => {
    const full = await fetch(photo.url);
    expect(full.status).toBe(200);
    expect(full.headers.get('content-type')).toBe('image/webp');
    const fullMeta = await sharp(Buffer.from(await full.arrayBuffer())).metadata();
    expect(fullMeta.exif).toBeUndefined();
    expect(fullMeta.xmp).toBeUndefined();
    expect(Math.max(fullMeta.width!, fullMeta.height!)).toBe(1600);
    // Orientation 6 was applied: the 3000×2000 landscape source is a portrait now.
    expect(fullMeta.height! > fullMeta.width!).toBe(true);

    const thumbMeta = await sharp(Buffer.from(await (await fetch(photo.thumbnailUrl)).arrayBuffer())).metadata();
    expect(thumbMeta.exif).toBeUndefined();
    expect(Math.max(thumbMeta.width!, thumbMeta.height!)).toBe(400);
  });

  it('the bucket is private: the same object without a signature is refused', async () => {
    const unsigned = photo.url.split('?')[0]!;
    expect((await fetch(unsigned)).status).toBe(403);
  });

  it('lists the photo newest first', async () => {
    await addPhoto(owner, owner.dogId, await makeCameraJpeg(800, 600));
    const list = (await api(owner, 'GET', `/me/dogs/${owner.dogId}/photos`)).json();
    expect(list).toHaveLength(2);
    expect(list[1].id).toBe(photo.id);
  });

  it('sets the profile photo; every dog response then carries fresh signed URLs', async () => {
    const res = await api(owner, 'PUT', `/me/dogs/${owner.dogId}/profile-photo`, { photoId: photo.id });
    expect(res.statusCode).toBe(200);
    expect(res.json().profilePhoto.thumbnailUrl).toContain(`/dogs/${owner.dogId}/${photo.id}/thumb.webp`);

    const dogs = (await api(owner, 'GET', '/me/dogs')).json();
    const freddy = dogs.find((d: { id: string }) => d.id === owner.dogId);
    expect((await fetch(freddy.profilePhoto.thumbnailUrl)).status).toBe(200);
    const patched = (await api(owner, 'PATCH', `/me/dogs/${owner.dogId}`, { breed: 'Corgi' })).json();
    expect(patched.profilePhoto).not.toBeNull();
  });

  it('another user can use neither the dog, the photo nor the upload key', async () => {
    expect((await api(other, 'GET', `/me/dogs/${owner.dogId}/photos`)).statusCode).toBe(404);
    expect((await api(other, 'DELETE', `/me/dogs/${owner.dogId}/photos/${photo.id}`)).statusCode).toBe(404);
    // A photo of another dog cannot become this dog's profile photo.
    expect((await api(other, 'PUT', `/me/dogs/${other.dogId}/profile-photo`, { photoId: photo.id })).statusCode).toBe(404);

    const ownersKey = await uploadBytes(owner, owner.dogId, await makeCameraJpeg(200, 200));
    const stolen = await api(other, 'POST', `/me/dogs/${other.dogId}/photos`, { uploadKey: ownersKey });
    expect(stolen.statusCode).toBe(404);
    expect(await testStorage.stat(ownersKey)).not.toBeNull(); // untouched
  });

  it('a file that is not an image is rejected and its upload removed', async () => {
    const uploadKey = await uploadBytes(owner, owner.dogId, Buffer.from('<html>tere</html>'.repeat(20)));
    const res = await api(owner, 'POST', `/me/dogs/${owner.dogId}/photos`, { uploadKey });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/pildina lugeda/);
    expect(await testStorage.stat(uploadKey)).toBeNull();
  });

  it('a key that was never uploaded is 404', async () => {
    const uploadKey = `uploads/${owner.id}/00000000-0000-4000-8000-000000000000`;
    expect((await api(owner, 'POST', `/me/dogs/${owner.dogId}/photos`, { uploadKey })).statusCode).toBe(404);
  });

  it('deleting the profile photo removes its objects and clears profilePhoto', async () => {
    const res = await api(owner, 'DELETE', `/me/dogs/${owner.dogId}/photos/${photo.id}`);
    expect(res.statusCode).toBe(204);
    expect(await testStorage.stat(`dogs/${owner.dogId}/${photo.id}/full.webp`)).toBeNull();
    expect(await testStorage.stat(`dogs/${owner.dogId}/${photo.id}/thumb.webp`)).toBeNull();
    const dogs = (await api(owner, 'GET', '/me/dogs')).json();
    expect(dogs.find((d: { id: string }) => d.id === owner.dogId).profilePhoto).toBeNull();
    expect((await api(owner, 'DELETE', `/me/dogs/${owner.dogId}/photos/${photo.id}`)).statusCode).toBe(404);
  });

  it('deleting a dog removes all of its objects', async () => {
    const dogId = await createDog(owner, 'Lühiajaline');
    const added = (await addPhoto(owner, dogId, await makeCameraJpeg(300, 300))).json();
    expect(await testStorage.stat(`dogs/${dogId}/${added.id}/full.webp`)).not.toBeNull();
    expect((await api(owner, 'DELETE', `/me/dogs/${dogId}`)).statusCode).toBe(204);
    expect(await testStorage.stat(`dogs/${dogId}/${added.id}/full.webp`)).toBeNull();
    expect(await testStorage.stat(`dogs/${dogId}/${added.id}/thumb.webp`)).toBeNull();
  });
});

describe('M4 health records and reminders', () => {
  let rabiesId = '';

  it('creates records and lists them newest date first', async () => {
    const rabies = await api(owner, 'POST', `/me/dogs/${owner.dogId}/health-records`, {
      kind: 'vaccination',
      title: 'Marutaud',
      date: day(-360),
      nextDue: day(5),
      clinic: 'Kadrioru loomakliinik',
    });
    expect(rabies.statusCode).toBe(201);
    rabiesId = rabies.json().id;
    expect(rabies.json()).toMatchObject({ dogId: owner.dogId, nextDue: day(5), notes: null });

    for (const record of [
      { kind: 'vet_visit', title: 'Hambakontroll', date: day(-200), nextDue: day(-3) }, // overdue
      { kind: 'vaccination', title: 'Kompleksvaktsiin', date: day(-30), nextDue: day(335) }, // outside window
      { kind: 'vaccination', title: 'Borrelioos', date: day(-400), nextDue: day(-35) }, // overdue, then repeated…
      { kind: 'vaccination', title: 'borrelioos', date: day(-20), nextDue: day(345) }, // …so the old one is superseded
      { kind: 'vet_visit', title: 'Üldkontroll', date: day(-10), nextDue: null },
    ]) {
      expect((await api(owner, 'POST', `/me/dogs/${owner.dogId}/health-records`, record)).statusCode).toBe(201);
    }
    const list = (await api(owner, 'GET', `/me/dogs/${owner.dogId}/health-records`)).json();
    expect(list.map((r: { title: string }) => r.title)).toEqual([
      'Üldkontroll',
      'borrelioos',
      'Kompleksvaktsiin',
      'Hambakontroll',
      'Marutaud',
      'Borrelioos',
    ]);
  });

  it('reminders: within 30 days or overdue, soonest first, superseded ones hidden', async () => {
    const reminders = (await api(owner, 'GET', '/me/health-reminders')).json();
    expect(reminders).toEqual([
      expect.objectContaining({ title: 'Hambakontroll', nextDue: day(-3), overdue: true, dog: { id: owner.dogId, name: 'Freddy' } }),
      expect.objectContaining({ recordId: rabiesId, title: 'Marutaud', nextDue: day(5), overdue: false }),
    ]);
  });

  it('PATCH that would put nextDue on or before the stored date is 400; a valid one is saved', async () => {
    const one = `/me/dogs/${owner.dogId}/health-records/${rabiesId}`;
    const bad = await api(owner, 'PATCH', one, { nextDue: day(-360) });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().message).toMatch(/pärast kuupäeva/);
    expect((await api(owner, 'PATCH', one, { date: day(10) })).statusCode).toBe(400); // future date
    const ok = await api(owner, 'PATCH', one, { nextDue: day(20), notes: 'Tõendi koopia kaustas' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ nextDue: day(20), notes: 'Tõendi koopia kaustas', clinic: 'Kadrioru loomakliinik' });
  });

  it('the database rejects nextDue ≤ date even without the API (CHECK constraint)', async () => {
    await expect(
      db.execute(sql`update health_records set next_due = date where id = ${rabiesId}`),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('records are private: another user gets 404 and none of them in their reminders', async () => {
    const one = `/me/dogs/${owner.dogId}/health-records/${rabiesId}`;
    expect((await api(other, 'GET', `/me/dogs/${owner.dogId}/health-records`)).statusCode).toBe(404);
    expect((await api(other, 'PATCH', one, { title: 'X' })).statusCode).toBe(404);
    expect((await api(other, 'DELETE', one)).statusCode).toBe(404);
    // The record id with the other user's own dog id is still not found.
    expect((await api(other, 'DELETE', `/me/dogs/${other.dogId}/health-records/${rabiesId}`)).statusCode).toBe(404);
    expect((await api(other, 'GET', '/me/health-reminders')).json()).toEqual([]);
    // …and health data never leaks into dog responses.
    const dog = (await api(owner, 'GET', '/me/dogs')).json()[0];
    expect(Object.keys(dog).sort()).toEqual(['birthDate', 'breed', 'id', 'name', 'profilePhoto', 'sex', 'temperament', 'weightKg']);
  });

  it('DELETE is 204, then 404', async () => {
    const one = `/me/dogs/${owner.dogId}/health-records/${rabiesId}`;
    expect((await api(owner, 'DELETE', one)).statusCode).toBe(204);
    expect((await api(owner, 'DELETE', one)).statusCode).toBe(404);
  });
});
