/**
 * M10 account deletion end to end with real Better Auth, PostgreSQL/PostGIS and MinIO
 * (docs/17-konto-privaatsus-e-post.md): a user with data in every table deletes their account; then
 * no row anywhere references them (checked generically over every foreign key to "user"), the other
 * person's conversation stays readable, the storage cleanup job carries the right keys and actually
 * empties MinIO, and the old session is dead. Also: the re-authentication window for password-less
 * accounts, sign-up consent, email confirmation (send, resend limit, link) and the data export.
 */
import { randomUUID } from 'node:crypto';

import { LEGAL_VERSIONS } from '@kapp/shared';
import { eq, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db, pool } from '../../src/db/client';
import {
  account,
  bookingDogs,
  bookings,
  checkInDogs,
  checkIns,
  conversationMembers,
  conversations,
  dogPhotos,
  dogs,
  favoriteParks,
  friendships,
  healthRecords,
  inviteCodes,
  messages,
  notificationPreferences,
  notifications,
  parkReports,
  parks,
  placePostLikes,
  placePostPhotos,
  placePostReports,
  placePosts,
  placePostSaves,
  plannedVisits,
  pushTokens,
  redemptions,
  referrals,
  reviews,
  rewardBalances,
  rewardLedger,
  rewardMilestones,
  serviceProviders,
  services,
  session,
  user,
  userBlocks,
  userReports,
  verification,
} from '../../src/db/schema';
import { createStorageCleanupProcessor, type StorageCleanupJob } from '../../src/modules/account/storage-cleanup';
import { noMailer, type Mailer } from '../../src/modules/mail/mailer';
import { buildRealApp, testStorage } from './real-app';

const DOMAIN = '@account-flow.test.invalid';
const RUN = Date.now();
const PASSWORD = 'pikk-parool-123';
const origin = { 'expo-origin': 'kapp://' };

const mail = {
  verifications: [] as Parameters<Mailer['sendEmailVerification']>[0][],
  deleted: [] as Parameters<Mailer['sendAccountDeleted']>[0][],
};
const mailer: Mailer = {
  ...noMailer,
  sendEmailVerification: async (m) => void mail.verifications.push(m),
  sendAccountDeleted: async (m) => void mail.deleted.push(m),
};
const cleanupJobs: StorageCleanupJob[] = [];
// Plain recorders, not vi.fn(): Vitest clears mock calls between tests (clearMocks) and these span tests.
const cancelledReminders: string[] = [];
const reminders = { schedule: async () => {}, cancel: async (bookingId: string) => void cancelledReminders.push(bookingId) };

let app: Awaited<ReturnType<typeof buildRealApp>>;
const people = {
  anna: { email: `anna-${RUN}${DOMAIN}`, cookie: '', id: '' },
  bert: { email: `bert-${RUN}${DOMAIN}`, cookie: '', id: '' },
  cleo: { email: `cleo-${RUN}${DOMAIN}`, cookie: '', id: '' },
};
type Who = keyof typeof people;
const createdParks: string[] = [];
const createdProviders: string[] = [];

const cookieOf = (setCookie: string | string[] | undefined) =>
  (Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []).map((c) => c.split(';')[0]).join('; ');

async function signUp(email: string, extra: Record<string, unknown> = {}) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/sign-up/email', headers: origin, payload: { name: 'Anna Tamm', email, password: PASSWORD, ...extra } });
  return { res, cookie: cookieOf(res.headers['set-cookie']) };
}
/** Per-IP rate limits are real here; each scenario uses its own client address so limits do not leak between them. */
let clientIp = '10.0.0.1';
const api = (who: Who | string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object, headers: Record<string, string> = {}) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    remoteAddress: clientIp,
    headers: { cookie: typeof who === 'string' && !(who in people) ? who : people[who as Who].cookie, ...headers },
    payload,
  });

beforeAll(async () => {
  app = await buildRealApp(mailer, { storageCleanup: { enqueue: async (job) => void cleanupJobs.push(job) }, bookingReminders: reminders });
  for (const who of Object.keys(people) as Who[]) {
    const { res, cookie } = await signUp(people[who].email, { termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy, language: who === 'anna' ? 'ru' : 'et' });
    expect(res.statusCode).toBe(200);
    people[who].cookie = cookie;
    people[who].id = (await api(who, 'GET', '/me')).json().id;
  }
});

afterAll(async () => {
  await app.close();
  await db.delete(user).where(like(user.email, `%${DOMAIN}`));
  for (const id of createdProviders) await db.delete(serviceProviders).where(eq(serviceProviders.id, id));
  for (const id of createdParks) await db.delete(parks).where(eq(parks.id, id));
  await pool.end();
});

describe('sign-up consent and email confirmation', () => {
  it('records the accepted legal versions, the language, and sends a confirmation link to our public page', async () => {
    const me = (await api('anna', 'GET', '/me')).json();
    expect(me).toMatchObject({ emailVerified: false, hasPassword: true, language: 'ru', legal: { termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy } });
    expect(Date.parse(me.legal.acceptedAt)).toBeGreaterThan(RUN - 60_000);

    const sent = mail.verifications.find((m) => m.to === people.anna.email);
    expect(sent).toMatchObject({ userId: people.anna.id, language: 'ru' });
    expect(sent!.url).toContain('/api/v1/auth/verify-email?token=');
    expect(decodeURIComponent(sent!.url)).toContain('http://localhost:3000/email-verified?lang=ru');
  });

  it('refuses stale legal versions at sign-up (translated), and a social-like sign-up without versions must accept later', async () => {
    const stale = await signUp(`stale-${RUN}${DOMAIN}`, { termsVersion: '2020-01-01', privacyVersion: LEGAL_VERSIONS.privacy });
    expect(stale.res.statusCode).toBe(400);
    expect(stale.res.json()).toEqual({ error: true, message: 'Tingimused muutusid vahepeal, ava need uuesti' });

    const none = await signUp(`noconsent-${RUN}${DOMAIN}`);
    expect(none.res.statusCode).toBe(200);
    expect((await api(none.cookie, 'GET', '/me')).json().legal).toEqual({ termsVersion: null, privacyVersion: null, acceptedAt: null });
    const accepted = await api(none.cookie, 'PUT', '/me/legal-acceptance', { termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy });
    expect(accepted.statusCode).toBe(200);
    expect((await api(none.cookie, 'GET', '/me')).json().legal.termsVersion).toBe(LEGAL_VERSIONS.terms);
    expect((await api(none.cookie, 'PUT', '/me/legal-acceptance', { termsVersion: 'old', privacyVersion: 'old' })).statusCode).toBe(409);
  });

  it('the public send-verification endpoint is disabled; the signed-in resend works and is rate limited', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/send-verification-email', headers: origin, payload: { email: people.cleo.email } })).statusCode).toBe(404);
    const before = mail.verifications.filter((m) => m.to === people.cleo.email).length;
    expect((await api('cleo', 'POST', '/me/email-verification')).statusCode).toBe(202);
    expect(mail.verifications.filter((m) => m.to === people.cleo.email).length).toBe(before + 1);
    expect((await api('cleo', 'POST', '/me/email-verification')).statusCode).toBe(202);
    expect((await api('cleo', 'POST', '/me/email-verification')).statusCode).toBe(202);
    expect((await api('cleo', 'POST', '/me/email-verification')).statusCode).toBe(429);
  });

  it('opening the link confirms the address and lands on /email-verified; afterwards resend is 409', async () => {
    clientIp = '10.0.0.2';
    const link = mail.verifications.find((m) => m.to === people.bert.email)!.url.replace('http://localhost:3000', '');
    const res = await app.inject({ method: 'GET', url: link });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('http://localhost:3000/email-verified?lang=et');
    expect((await api('bert', 'GET', '/me')).json().emailVerified).toBe(true);
    expect((await api('bert', 'POST', '/me/email-verification')).statusCode).toBe(409);

    const bad = await app.inject({ method: 'GET', url: link.replace(/token=[^&]+/, 'token=broken') });
    expect(bad.headers.location).toContain('/email-verified?lang=et&error=');
  });
});

describe('DELETE /me — everything the user owns goes, nothing references them', () => {
  const ids = { dog: '', photo: '', placePost: '', bertPost: '', futureBooking: '', pastBooking: '', withBert: '', lonely: '' };
  const keys = { full: '', thumb: '', orphan: '', placeFull: '', placeThumb: '', upload: '', health: '', report: '' };

  it('fills every table for Anna (and the shared ones with Bert and Cleo)', async () => {
    const anna = people.anna.id;
    const bert = people.bert.id;
    const cleo = people.cleo.id;
    const [park] = await db.insert(parks).values({ name: `M10 park ${RUN}`, location: { x: 24.79, y: 59.44 }, status: 'approved', createdBy: anna }).returning({ id: parks.id });
    createdParks.push(park!.id);
    const parkId = park!.id;

    const [dog] = await db.insert(dogs).values({ ownerId: anna, name: 'Muki' }).returning({ id: dogs.id });
    ids.dog = dog!.id;
    ids.photo = randomUUID();
    keys.full = `dogs/${ids.dog}/${ids.photo}/full.webp`;
    keys.thumb = `dogs/${ids.dog}/${ids.photo}/thumb.webp`;
    keys.orphan = `dogs/${ids.dog}/${randomUUID()}/full.webp`; // object without a row (failed upload)
    keys.upload = `uploads/${anna}/${randomUUID()}`;
    keys.health = `health/${ids.dog}/${randomUUID()}.pdf`;
    keys.report = `reports/${randomUUID()}.webp`;
    await db.insert(dogPhotos).values({ id: ids.photo, dogId: ids.dog, imageKey: keys.full, thumbnailKey: keys.thumb });
    await db.update(dogs).set({ profilePhotoId: ids.photo }).where(eq(dogs.id, ids.dog));
    await db.insert(healthRecords).values({ dogId: ids.dog, kind: 'vaccination', title: 'Marutaud', date: '2026-01-10', documentKey: keys.health });
    const [checkIn] = await db
      .insert(checkIns)
      .values({ userId: anna, parkId, expiresAt: new Date(Date.now() + 3_600_000), endedAt: new Date() })
      .returning({ id: checkIns.id });
    await db.insert(checkInDogs).values({ checkInId: checkIn!.id, dogId: ids.dog });
    await db.insert(plannedVisits).values({ userId: anna, parkId, startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000) });
    await db.insert(reviews).values({ userId: anna, parkId, rating: 5, body: 'Super' });
    await db.insert(favoriteParks).values({ userId: anna, parkId });
    await db.insert(parkReports).values({ parkId, userId: anna, description: 'Aed katki', photoKey: keys.report });

    // Community: friends with Bert, a conversation both ways, a lonely conversation (other member gone).
    await db.insert(friendships).values({ requesterId: anna, addresseeId: bert, status: 'accepted' });
    await db.insert(friendships).values({ requesterId: cleo, addresseeId: anna, status: 'pending' });
    const [conv] = await db.insert(conversations).values({ directKey: anna < bert ? `${anna}:${bert}` : `${bert}:${anna}` }).returning({ id: conversations.id });
    ids.withBert = conv!.id;
    await db.insert(conversationMembers).values([
      { conversationId: ids.withBert, userId: anna },
      { conversationId: ids.withBert, userId: bert },
    ]);
    await db.insert(messages).values({ conversationId: ids.withBert, senderId: anna, body: 'Tere Bert, lähme parki?', createdAt: new Date(Date.now() - 2000) });
    await db.insert(messages).values({ conversationId: ids.withBert, senderId: bert, body: 'Jah, kell 18!', createdAt: new Date(Date.now() - 1000) });
    const [lonely] = await db.insert(conversations).values({ directKey: `${anna}:ghost-${RUN}` }).returning({ id: conversations.id });
    ids.lonely = lonely!.id;
    await db.insert(conversationMembers).values({ conversationId: ids.lonely, userId: anna });
    await db.insert(messages).values({ conversationId: ids.lonely, senderId: anna, body: 'Kas oled seal?' });

    await db.insert(userBlocks).values([
      { blockerId: anna, blockedId: cleo },
      { blockerId: cleo, blockedId: anna },
    ]);
    await db.insert(userReports).values([
      { reporterId: anna, reportedId: cleo, reason: 'spam', details: 'Saadab reklaami' },
      { reporterId: cleo, reportedId: anna, reason: 'other' },
    ]);
    await db.insert(notifications).values([
      { userId: anna, type: 'friend_request', actorId: cleo },
      { userId: bert, type: 'message', actorId: anna, data: { conversationId: ids.withBert } },
    ]);
    await db.insert(notificationPreferences).values({ userId: anna, messages: false });
    await db.insert(pushTokens).values({ token: `ExponentPushToken[anna-${RUN}]`, userId: anna, platform: 'ios' });

    // Explore: Anna's post with a photo, Bert's post; likes and saves both ways; a report.
    const [post] = await db
      .insert(placePosts)
      .values({ authorId: anna, name: 'Kohvik Käpp', category: 'cafe', location: { x: 24.75, y: 59.43 }, status: 'approved', moderatedAt: new Date() })
      .returning({ id: placePosts.id });
    ids.placePost = post!.id;
    const placePhoto = randomUUID();
    keys.placeFull = `places/${ids.placePost}/${placePhoto}/full.webp`;
    keys.placeThumb = `places/${ids.placePost}/${placePhoto}/thumb.webp`;
    await db.insert(placePostPhotos).values({ id: placePhoto, postId: ids.placePost, position: 0, imageKey: keys.placeFull, thumbnailKey: keys.placeThumb });
    const [bertPost] = await db
      .insert(placePosts)
      .values({ authorId: bert, name: 'Rand', category: 'beach', location: { x: 24.7, y: 59.45 }, status: 'approved', moderatedAt: new Date() })
      .returning({ id: placePosts.id });
    ids.bertPost = bertPost!.id;
    await db.insert(placePostLikes).values([
      { postId: ids.placePost, userId: bert },
      { postId: ids.bertPost, userId: anna },
    ]);
    await db.insert(placePostSaves).values({ postId: ids.bertPost, userId: anna });
    await db.insert(placePostReports).values({ postId: ids.bertPost, reporterId: anna, reason: 'wrong_info' });

    // Services, bookings (future + past), a redemption, Käpad ledger, invite and referral.
    const [provider] = await db
      .insert(serviceProviders)
      .values({ name: `M10 salong ${RUN}`, category: 'grooming', area: 'Kadriorg', location: { x: 24.79, y: 59.44 } })
      .returning({ id: serviceProviders.id });
    createdProviders.push(provider!.id);
    const [service] = await db.insert(services).values({ providerId: provider!.id, name: 'Pesu', durationMinutes: 60, priceCents: 3000 }).returning({ id: services.id });
    const future = new Date(Date.now() + 3 * 86_400_000);
    const [futureBooking] = await db
      .insert(bookings)
      .values({ userId: anna, providerId: provider!.id, serviceId: service!.id, startsAt: future, endsAt: new Date(future.getTime() + 3_600_000), priceCents: 3000, priceIsFrom: false })
      .returning({ id: bookings.id });
    ids.futureBooking = futureBooking!.id;
    await db.insert(bookingDogs).values({ bookingId: ids.futureBooking, dogId: ids.dog });
    const past = new Date(Date.now() - 3 * 86_400_000);
    const [pastBooking] = await db
      .insert(bookings)
      .values({ userId: anna, providerId: provider!.id, serviceId: service!.id, startsAt: past, endsAt: new Date(past.getTime() + 3_600_000), priceCents: 3000, priceIsFrom: false })
      .returning({ id: bookings.id });
    ids.pastBooking = pastBooking!.id;
    await db.insert(redemptions).values({ userId: anna, offerType: 'booking', providerId: provider!.id, discountPercent: 10, pointsCost: 100, code: `M10${RUN}`.slice(0, 12), expiresAt: future });
    await db.insert(rewardLedger).values({ userId: anna, delta: 150, reason: 'check_in', sourceId: `${parkId}:2026-10-05`, day: '2026-10-05' });
    await db.insert(rewardBalances).values({ userId: anna, balance: 150, lifetimeEarned: 150 });
    await db.insert(rewardMilestones).values({ userId: anna, kind: 'level', key: 'puppy' });
    await db.insert(inviteCodes).values({ userId: anna, code: `A${RUN}`.slice(0, 8) });
    await db.insert(referrals).values({ inviteeId: bert, inviterId: anna });
    await db.insert(verification).values({ id: randomUUID(), identifier: `reset-password:${randomUUID()}`, value: anna, expiresAt: new Date(Date.now() + 3_600_000) });

    // The files exist in MinIO, including ones without a row.
    for (const key of [keys.full, keys.thumb, keys.orphan, keys.placeFull, keys.placeThumb, keys.upload, keys.health, keys.report]) {
      await testStorage.write(key, Buffer.from('x'), 'application/octet-stream');
    }
  });

  it('refuses without the password and with a wrong one (403, Accept-Language)', async () => {
    clientIp = '10.0.0.3';
    const missing = await api('anna', 'DELETE', '/me', {});
    expect(missing.statusCode).toBe(403);
    expect(missing.json().message).toBe('Sisesta konto kustutamiseks oma parool');
    const wrong = await api('anna', 'DELETE', '/me', { password: 'vale-parool-999' }, { 'accept-language': 'en' });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json().message).toBe('The password is not correct');
    expect((await api('anna', 'GET', '/me')).statusCode).toBe(200);
  });

  it('204 with the password; afterwards no row in any table references Anna', async () => {
    const res = await api('anna', 'DELETE', '/me', { password: PASSWORD });
    expect(res.statusCode).toBe(204);

    const { rows: fks } = await db.execute<{ table_name: string; column_name: string }>(sql`
      select kcu.table_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
        and ccu.table_name = 'user' and ccu.column_name = 'id'`);
    const columns = fks.map((f) => `${f.table_name}.${f.column_name}`);
    // The generic check really sees the schema (a broken query would pass vacuously).
    expect(columns).toEqual(expect.arrayContaining(['messages.sender_id', 'reward_ledger.user_id', 'session.user_id', 'parks.created_by', 'referrals.inviter_id']));
    expect(columns.length).toBeGreaterThanOrEqual(30);
    const leftovers: string[] = [];
    for (const { table_name, column_name } of fks) {
      // Identifiers come from the catalog, not from input.
      const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table_name)} where ${sql.identifier(column_name)} = ${people.anna.id}`);
      if (rows[0]!.n > 0) leftovers.push(`${table_name}.${column_name}`);
    }
    expect(leftovers).toEqual([]);
    // Not foreign keys: Better Auth's verification rows and the user row itself.
    expect((await db.select().from(verification).where(eq(verification.value, people.anna.id))).length).toBe(0);
    expect((await db.select().from(user).where(eq(user.id, people.anna.id))).length).toBe(0);
    expect((await db.select().from(account).where(eq(account.userId, people.anna.id))).length).toBe(0);
  });

  it('owned rows behind other tables are gone too (dog → photos/health, post → photos/likes, bookings → dogs)', async () => {
    expect(await db.select().from(dogs).where(eq(dogs.id, ids.dog))).toEqual([]);
    expect(await db.select().from(dogPhotos).where(eq(dogPhotos.dogId, ids.dog))).toEqual([]);
    expect(await db.select().from(healthRecords).where(eq(healthRecords.dogId, ids.dog))).toEqual([]);
    expect(await db.select().from(placePosts).where(eq(placePosts.id, ids.placePost))).toEqual([]);
    expect(await db.select().from(placePostLikes).where(eq(placePostLikes.postId, ids.placePost))).toEqual([]);
    expect(await db.select().from(bookingDogs).where(eq(bookingDogs.bookingId, ids.futureBooking))).toEqual([]);
    expect(await db.select().from(conversations).where(eq(conversations.id, ids.lonely))).toEqual([]);
    // Reports Anna filed are deleted, not kept with a null reporter.
    expect(await db.select().from(placePostReports).where(eq(placePostReports.postId, ids.bertPost))).toEqual([]);
    // Bert's own post survives.
    expect((await db.select().from(placePosts).where(eq(placePosts.id, ids.bertPost))).length).toBe(1);
  });

  it("Bert's conversation stays readable: Anna's message is anonymised, nothing can be sent", async () => {
    const list = (await api('bert', 'GET', '/me/conversations')).json();
    const conv = list.find((c: { id: string }) => c.id === ids.withBert);
    expect(conv).toMatchObject({ other: null, canMessage: false, lastMessage: { body: 'Jah, kell 18!', senderId: people.bert.id } });
    const page = (await api('bert', 'GET', `/me/conversations/${ids.withBert}/messages`)).json();
    expect(page.messages.map((m: { body: string; senderId: string | null }) => [m.body, m.senderId])).toEqual([
      ['Jah, kell 18!', people.bert.id],
      ['Tere Bert, lähme parki?', null],
    ]);
    const send = await api('bert', 'POST', `/me/conversations/${ids.withBert}/messages`, { body: 'Halloo?' });
    expect(send.statusCode).toBe(403);
    expect((await api('bert', 'PUT', `/me/conversations/${ids.withBert}/read`)).statusCode).toBe(204);
  });

  it('after the commit: storage job with every key and prefix, reminder removed for the future booking, email in her language', async () => {
    expect(cleanupJobs).toHaveLength(1);
    const job = cleanupJobs[0]!;
    expect(job.userId).toBe(people.anna.id);
    expect(job.keys.sort()).toEqual([keys.full, keys.thumb, keys.health, keys.placeFull, keys.placeThumb, keys.report].sort());
    expect(job.prefixes.sort()).toEqual([`dogs/${ids.dog}/`, `places/${ids.placePost}/`, `uploads/${people.anna.id}/`].sort());
    expect(cancelledReminders).toEqual([ids.futureBooking]);
    expect(mail.deleted).toEqual([{ userId: people.anna.id, to: people.anna.email, name: 'Anna Tamm', language: 'ru' }]);
  });

  it('the cleanup job empties MinIO (also objects without rows) and is safe to run twice', async () => {
    const process = createStorageCleanupProcessor(testStorage);
    await process({ data: cleanupJobs[0]! });
    await process({ data: cleanupJobs[0]! });
    for (const key of Object.values(keys)) expect(await testStorage.stat(key)).toBeNull();
  });

  it('the old session is dead: a second DELETE is 401', async () => {
    const again = await api('anna', 'DELETE', '/me', { password: PASSWORD });
    expect(again.statusCode).toBe(401);
    expect((await api('anna', 'GET', '/me')).statusCode).toBe(401);
  });
});

describe('password-less accounts (Apple/Google): re-authentication window', () => {
  it('403 errors.reauthRequired with an old session, 204 right after signing in', async () => {
    clientIp = '10.0.0.4';
    const email = `social-${RUN}${DOMAIN}`;
    const { cookie } = await signUp(email);
    const me = (await api(cookie, 'GET', '/me')).json();
    // Make it look like an Apple account: no password login.
    await db.update(account).set({ password: null }).where(eq(account.userId, me.id));
    expect((await api(cookie, 'GET', '/me')).json().hasPassword).toBe(false);

    await db.update(session).set({ createdAt: new Date(Date.now() - 20 * 60_000) }).where(eq(session.userId, me.id));
    const stale = await api(cookie, 'DELETE', '/me', {});
    expect(stale.statusCode).toBe(403);
    expect(stale.json().message).toBe('Turvalisuse huvides logi uuesti sisse ja kustuta konto kohe pärast seda');

    await db.update(session).set({ createdAt: new Date(Date.now() - 60_000) }).where(eq(session.userId, me.id));
    expect((await api(cookie, 'DELETE', '/me', {})).statusCode).toBe(204);
    expect(await db.select().from(user).where(eq(user.id, me.id))).toEqual([]);
  });
});

describe('GET /me/export', () => {
  it("returns Bert's data without secrets or other people's private fields", async () => {
    clientIp = '10.0.0.5';
    await db.insert(dogs).values({ ownerId: people.bert.id, name: 'Pontu' });
    const res = await api('bert', 'GET', '/me/export');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.format).toBe('kapp-export/1');
    expect(body.sections.account).toMatchObject({ id: people.bert.id, email: people.bert.email });
    expect(body.sections.dogs.map((d: { name: string }) => d.name)).toContain('Pontu');
    expect(body.sections.logins).toEqual([expect.objectContaining({ provider_id: 'credential' })]);
    const text = res.body;
    expect(text).not.toMatch(/"password"|"token"|access_token|scrypt|id_token/);
  });
});
