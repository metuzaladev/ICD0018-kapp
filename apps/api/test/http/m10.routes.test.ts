import { LEGAL_VERSIONS } from '@kapp/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { ConflictError, ForbiddenError, NotFoundError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import { buildTestApp, fakeAuth, makeProfile, USER_ID } from '../helpers';
import { expectApiError } from './expect-api-error';

let ctx: Awaited<ReturnType<typeof buildTestApp>> | undefined;
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

const auth = { authorization: 'Bearer test' };
const SESSION_START = new Date('2026-10-05T11:55:00Z');
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
const app = async () => (ctx = await buildTestApp({ resolveUserId: fakeAuth, resolveSessionStart: async () => SESSION_START }));
const req = (method: Method, url: string, payload?: unknown, headers: Record<string, string> = {}) =>
  ctx!.app.inject({ method, url: `/api/v1${url}`, headers: { ...auth, ...headers }, payload: payload as object });
const anon = (method: Method, url: string, payload?: unknown) => ctx!.app.inject({ method, url: `/api/v1${url}`, payload: payload as object });

describe('DELETE /api/v1/me (M10 account deletion)', () => {
  it('204 with the password and the session start passed to the service', async () => {
    await app();
    ctx!.account.deleteAccount.mockResolvedValue(undefined);
    const res = await req('DELETE', '/me', { password: 'pikk-parool-123' });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect(ctx!.account.deleteAccount).toHaveBeenCalledWith(USER_ID, { password: 'pikk-parool-123', sessionCreatedAt: SESSION_START });
  });

  it('204 for a password-less account sending {}', async () => {
    await app();
    ctx!.account.deleteAccount.mockResolvedValue(undefined);
    expect((await req('DELETE', '/me', {})).statusCode).toBe(204);
    expect(ctx!.account.deleteAccount).toHaveBeenCalledWith(USER_ID, { sessionCreatedAt: SESSION_START });
  });

  it('an unknown session start counts as an old session (epoch)', async () => {
    ctx = await buildTestApp({ resolveUserId: fakeAuth });
    ctx.account.deleteAccount.mockResolvedValue(undefined);
    await req('DELETE', '/me', {});
    expect(ctx.account.deleteAccount).toHaveBeenCalledWith(USER_ID, { sessionCreatedAt: new Date(0) });
  });

  it('401 before validation when signed out — also the answer to a second call after deletion', async () => {
    await app();
    const res = await anon('DELETE', '/me', { password: 1 });
    expect(res.statusCode).toBe(401);
    expectApiError(res, 'Palun logi sisse');
    expect(ctx!.account.deleteAccount).not.toHaveBeenCalled();
  });

  it('400 for a missing body, null password, wrong type and unknown fields', async () => {
    await app();
    expect((await req('DELETE', '/me')).statusCode).toBe(400);
    for (const body of [{ password: null }, { password: 123 }, { password: '' }, { password: 'x', confirm: true }]) {
      const res = await req('DELETE', '/me', body);
      expect(res.statusCode).toBe(400);
      expectApiError(res);
    }
    expect(ctx!.account.deleteAccount).not.toHaveBeenCalled();
  });

  it('403 keys are translated per Accept-Language (password missing / wrong / sign in again)', async () => {
    await app();
    ctx!.account.deleteAccount.mockRejectedValueOnce(new ForbiddenError('errors.reauthPasswordWrong'));
    const wrong = await req('DELETE', '/me', { password: 'x' });
    expect(wrong.statusCode).toBe(403);
    expectApiError(wrong, 'Parool ei ole õige');

    ctx!.account.deleteAccount.mockRejectedValueOnce(new ForbiddenError('errors.reauthRequired'));
    const stale = await req('DELETE', '/me', {}, { 'accept-language': 'en' });
    expectApiError(stale, 'For your security, sign in again and delete the account right after that');

    ctx!.account.deleteAccount.mockRejectedValueOnce(new ForbiddenError('errors.reauthPasswordRequired'));
    expectApiError(await req('DELETE', '/me', {}, { 'accept-language': 'ru' }), 'Введите пароль, чтобы удалить аккаунт');
  });

  it('404 when the account is already gone, 503 on timeout', async () => {
    await app();
    ctx!.account.deleteAccount.mockRejectedValueOnce(new NotFoundError('errors.userNotFound'));
    expect((await req('DELETE', '/me', { password: 'x' })).statusCode).toBe(404);
    ctx!.account.deleteAccount.mockRejectedValueOnce(new TimeoutError('account.delete', 8000));
    const res = await req('DELETE', '/me', { password: 'x' });
    expect(res.statusCode).toBe(503);
    expectApiError(res);
  });

  it('429 after 5 attempts in 15 minutes (no password guessing through deletion)', async () => {
    await app();
    ctx!.account.deleteAccount.mockRejectedValue(new ForbiddenError('errors.reauthPasswordWrong'));
    for (let i = 0; i < 5; i++) expect((await req('DELETE', '/me', { password: `guess-${i}` })).statusCode).toBe(403);
    const res = await req('DELETE', '/me', { password: 'guess-6' });
    expect(res.statusCode).toBe(429);
    expectApiError(res, 'Liiga palju päringuid');
  });

  it('GET /me still returns the M10 profile fields', async () => {
    await app();
    ctx!.profile.getOwnProfile.mockResolvedValue(makeProfile({ emailVerified: false, hasPassword: false }));
    expect((await req('GET', '/me')).json()).toMatchObject({ emailVerified: false, hasPassword: false, legal: { termsVersion: LEGAL_VERSIONS.terms } });
  });
});

describe('PUT /api/v1/me/legal-acceptance', () => {
  const body = { termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy };

  it('200 with the stored acceptance', async () => {
    await app();
    ctx!.account.acceptLegal.mockResolvedValue({ ...body, acceptedAt: '2026-10-05T12:00:00.000Z' });
    const res = await req('PUT', '/me/legal-acceptance', body);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ...body, acceptedAt: '2026-10-05T12:00:00.000Z' });
    expect(ctx!.account.acceptLegal).toHaveBeenCalledWith(USER_ID, body);
  });

  it('400 for missing/null/unknown fields, 401 signed out, 409 stale version', async () => {
    await app();
    for (const bad of [{}, { ...body, termsVersion: null }, { ...body, extra: 1 }, { ...body, privacyVersion: 5 }]) {
      expect((await req('PUT', '/me/legal-acceptance', bad)).statusCode).toBe(400);
    }
    expect((await anon('PUT', '/me/legal-acceptance', body)).statusCode).toBe(401);
    ctx!.account.acceptLegal.mockRejectedValue(new ConflictError('errors.legalVersionOutdated'));
    const res = await req('PUT', '/me/legal-acceptance', { ...body, termsVersion: '2020-01-01' });
    expect(res.statusCode).toBe(409);
    expectApiError(res, 'Tingimused muutusid vahepeal');
  });
});

describe('GET /api/v1/me/export', () => {
  it('200 as a JSON attachment that is never cached', async () => {
    await app();
    ctx!.account.exportData.mockResolvedValue({ exportedAt: '2026-10-05T12:00:00.000Z', format: 'kapp-export/1', sections: { account: { id: USER_ID } } });
    const res = await req('GET', '/me/export');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="kapp-export.json"');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json().sections.account.id).toBe(USER_ID);
  });

  it('401 signed out, 503 on timeout, 429 after 5 per hour', async () => {
    await app();
    expect((await anon('GET', '/me/export')).statusCode).toBe(401);
    ctx!.account.exportData.mockRejectedValueOnce(new TimeoutError('account.export', 8000));
    expect((await req('GET', '/me/export')).statusCode).toBe(503);
    ctx!.account.exportData.mockResolvedValue({ exportedAt: 'x', format: 'kapp-export/1', sections: {} });
    // Every request counts, also the anonymous and the failed one (the limit runs before auth): 2 + 3 = 5.
    for (let i = 0; i < 3; i++) expect((await req('GET', '/me/export')).statusCode).toBe(200);
    expect((await req('GET', '/me/export')).statusCode).toBe(429);
  });
});

describe('POST /api/v1/me/email-verification', () => {
  it('202 and passes the request headers (session) through', async () => {
    await app();
    ctx!.account.resendVerification.mockResolvedValue(undefined);
    const res = await req('POST', '/me/email-verification');
    expect(res.statusCode).toBe(202);
    expect(ctx!.account.resendVerification).toHaveBeenCalledWith(USER_ID, { headers: expect.objectContaining({ authorization: 'Bearer test' }) });
  });

  it('409 when already confirmed, 401 signed out, 429 after 3 per hour', async () => {
    await app();
    expect((await anon('POST', '/me/email-verification')).statusCode).toBe(401);
    ctx!.account.resendVerification.mockRejectedValueOnce(new ConflictError('errors.emailAlreadyVerified'));
    const conflict = await req('POST', '/me/email-verification');
    expect(conflict.statusCode).toBe(409);
    expectApiError(conflict, 'E-posti aadress on juba kinnitatud');
    ctx!.account.resendVerification.mockResolvedValue(undefined);
    // The anonymous and the 409 request count too: the third request is the last allowed one.
    expect((await req('POST', '/me/email-verification')).statusCode).toBe(202);
    const limited = await req('POST', '/me/email-verification');
    expect(limited.statusCode).toBe(429);
  });
});

describe('public legal pages (store URLs)', () => {
  const page = (url: string, headers: Record<string, string> = {}) => ctx!.app.inject({ method: 'GET', url, headers });

  it('GET /legal/privacy: self-contained accessible HTML in Estonian by default', async () => {
    await app();
    const res = await page('/legal/privacy');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.body).toContain('<html lang="et">');
    expect(res.body).toContain('<title>Käpa privaatsuspoliitika</title>');
    expect(res.body).toContain('<h1>Käpa privaatsuspoliitika</h1>');
    expect(res.body).toContain(LEGAL_VERSIONS.privacy);
    // No external assets: no scripts, stylesheets or images (links to other pages are fine).
    expect(res.body).not.toMatch(/<script|<link|<img|src=/i);
    // Language switcher links to the other two.
    expect(res.body).toContain('href="/legal/privacy?lang=en"');
    expect(res.body).toContain('href="/legal/privacy?lang=ru"');
  });

  it('?lang wins over Accept-Language; Accept-Language picks otherwise', async () => {
    await app();
    expect((await page('/legal/terms?lang=en', { 'accept-language': 'ru' })).body).toContain('<h1>Käpp terms of use</h1>');
    const ru = await page('/legal/terms', { 'accept-language': 'ru-RU,ru;q=0.9' });
    expect(ru.body).toContain('<html lang="ru">');
    expect(ru.headers['content-language']).toBe('ru');
  });

  it('400 for an unsupported ?lang, 404 for an unknown document', async () => {
    await app();
    const bad = await page('/legal/privacy?lang=de');
    expect(bad.statusCode).toBe(400);
    expectApiError(bad);
    expect((await page('/legal/cookies')).statusCode).toBe(404);
  });

  it('does not need a session', async () => {
    ctx = await buildTestApp();
    expect((await page('/legal/terms')).statusCode).toBe(200);
  });

  it('GET /email-verified shows success, or the failure text when Better Auth adds ?error=', async () => {
    await app();
    const ok = await page('/email-verified?lang=en');
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain('<h1>Email confirmed</h1>');
    const failed = await page('/email-verified?error=TOKEN_EXPIRED');
    expect(failed.body).toContain('<h1>Linki ei saanud kasutada</h1>');
    expect(failed.headers['cache-control']).toBe('no-store');
  });
});
