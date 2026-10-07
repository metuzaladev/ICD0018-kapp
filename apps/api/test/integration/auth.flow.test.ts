/**
 * Real Better Auth + PostgreSQL: the full account flow the mobile app uses.
 * Requests carry `expo-origin: kapp://` exactly like the Expo client (@better-auth/expo) does.
 */
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db, pool } from '../../src/db/client';
import { user } from '../../src/db/schema';
import { noMailer, type Mailer } from '../../src/modules/mail/mailer';
import { buildRealApp } from './real-app';

const EMAIL_DOMAIN = '@auth-flow.test.invalid';
const email = `kasutaja-${Date.now()}${EMAIL_DOMAIN}`;
const password = 'pikk-parool-123';
const sentResets: { to: string; url: string }[] = [];
const mailer: Mailer = { ...noMailer, sendPasswordReset: async (m) => void sentResets.push(m) };

let app: Awaited<ReturnType<typeof buildRealApp>>;
const origin = { 'expo-origin': 'kapp://' };

function cookieHeader(setCookie: string | string[] | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

beforeAll(async () => {
  app = await buildRealApp(mailer);
});

afterAll(async () => {
  await db.delete(user).where(like(user.email, `%${EMAIL_DOMAIN}`));
  await app.close();
  await pool.end();
});

describe('account flow', () => {
  let cookies = '';

  it('signs up and receives a session cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-up/email',
      headers: origin,
      payload: { name: 'Kristofer', email, password },
    });
    expect(res.statusCode).toBe(200);
    cookies = cookieHeader(res.headers['set-cookie']);
    expect(cookies).toContain('kapp.session_token=');
  });

  it('stores the default profile fields', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: cookies } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email, name: 'Kristofer', presenceSharing: 'friends', area: null, bio: null });
  });

  it('updates the profile through PATCH /me', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { cookie: cookies },
      payload: { area: 'Kadriorg', presenceSharing: 'nobody' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ area: 'Kadriorg', presenceSharing: 'nobody', name: 'Kristofer' });
  });

  it('refuses a second account with the same email (Estonian message)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-up/email',
      headers: origin,
      payload: { name: 'Teine', email, password },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.json()).toEqual({ error: true, message: 'Selle e-postiga konto on juba olemas' });
  });

  it('rejects a wrong password without revealing which part was wrong', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in/email',
      headers: origin,
      payload: { email, password: 'vale-parool-000' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: true, message: 'Vale e-post või parool' });
  });

  it('rejects a too short password and a one-letter name on sign-up', async () => {
    const short = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-up/email',
      headers: origin,
      payload: { name: 'Kolmas', email: `lyhike${EMAIL_DOMAIN}`, password: '123' },
    });
    expect(short.statusCode).toBe(400);
    expect(short.json().message).toBe('Parool on liiga lühike');

    const name = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-up/email',
      headers: origin,
      payload: { name: 'K', email: `nimi${EMAIL_DOMAIN}`, password },
    });
    expect(name.statusCode).toBe(400);
    expect(name.json().message).toBe('Nimi peab olema 2–60 märki');
    const [created] = await db.select().from(user).where(eq(user.email, `nimi${EMAIL_DOMAIN}`));
    expect(created).toBeUndefined();
  });

  it('keeps the unvalidated Better Auth update-user endpoint disabled', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/update-user',
      headers: { ...origin, cookie: cookies },
      payload: { name: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('sends a password reset link through the mailer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/request-password-reset',
      headers: origin,
      payload: { email, redirectTo: 'kapp://new-password' },
    });
    expect(res.statusCode).toBe(200);
    expect(sentResets.at(-1)?.to).toBe(email);
    expect(sentResets.at(-1)?.url).toContain('/api/v1/auth/reset-password/');
  });

  it('signs out and the old cookie no longer works', async () => {
    const out = await app.inject({ method: 'POST', url: '/api/v1/auth/sign-out', headers: { ...origin, cookie: cookies } });
    expect(out.statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: cookies } });
    expect(me.statusCode).toBe(401);
  });
});
