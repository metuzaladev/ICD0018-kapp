import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildTestApp } from '../helpers';
import { expectApiError } from './expect-api-error';

/**
 * The auth proxy with a fake Better Auth handler: checks what is forwarded and how responses
 * (cookies, errors) come back. Real Better Auth behaviour is covered in integration/auth.flow.
 */

let ctx: Awaited<ReturnType<typeof buildTestApp>> | undefined;
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

function fakeHandler(response: Response) {
  return vi.fn(async (_req: Request) => response);
}

describe('/api/v1/auth/* proxy', () => {
  it('forwards method, path, query, headers and JSON body', async () => {
    const handler = fakeHandler(Response.json({ ok: true }));
    ctx = await buildTestApp({ authHandler: handler });

    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in/email?x=1',
      headers: { cookie: 'kapp.session_token=abc', 'expo-origin': 'kapp://' },
      payload: { email: 'a@b.ee', password: 'secret123' },
    });

    const req = handler.mock.calls[0]![0];
    expect(req.method).toBe('POST');
    expect(new URL(req.url).pathname).toBe('/api/v1/auth/sign-in/email');
    expect(new URL(req.url).search).toBe('?x=1');
    expect(req.headers.get('cookie')).toBe('kapp.session_token=abc');
    expect(req.headers.get('expo-origin')).toBe('kapp://');
    await expect(req.json()).resolves.toEqual({ email: 'a@b.ee', password: 'secret123' });
  });

  it('keeps multiple Set-Cookie headers separate', async () => {
    const headers = new Headers();
    headers.append('set-cookie', 'kapp.session_token=one; Path=/; HttpOnly');
    headers.append('set-cookie', 'kapp.session_data=two; Path=/; HttpOnly');
    ctx = await buildTestApp({ authHandler: fakeHandler(new Response('{}', { status: 200, headers })) });

    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/sign-in/email', payload: {} });

    expect(res.headers['set-cookie']).toEqual([
      'kapp.session_token=one; Path=/; HttpOnly',
      'kapp.session_data=two; Path=/; HttpOnly',
    ]);
  });

  it('rewrites Better Auth errors into the standard Estonian shape', async () => {
    ctx = await buildTestApp({
      authHandler: fakeHandler(Response.json({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, { status: 401 })),
    });
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/sign-in/email', payload: {} });
    expect(res.statusCode).toBe(401);
    expectApiError(res, 'Vale e-post või parool');
  });

  it('handles a non-JSON error body', async () => {
    ctx = await buildTestApp({ authHandler: fakeHandler(new Response('Internal Server Error', { status: 500 })) });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/get-session' });
    expect(res.statusCode).toBe(500);
    expectApiError(res);
    expect(res.body).not.toContain('Internal Server Error');
  });

  it('passes form-encoded callbacks (Sign in with Apple) through as raw text', async () => {
    const handler = fakeHandler(new Response(null, { status: 302, headers: { location: 'kapp://' } }));
    ctx = await buildTestApp({ authHandler: handler });

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/callback/apple',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'code=abc&state=xyz',
    });

    expect(res.statusCode).toBe(302);
    await expect(handler.mock.calls[0]![0].text()).resolves.toBe('code=abc&state=xyz');
  });

  it('is not mounted when no auth handler is configured', async () => {
    ctx = await buildTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/get-session' });
    expect(res.statusCode).toBe(404);
  });

  it('503 when Better Auth throws because the database is down', async () => {
    ctx = await buildTestApp({
      authHandler: vi.fn(async () => {
        throw Object.assign(new Error('connect'), { code: 'ECONNREFUSED' });
      }),
    });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/get-session' });
    expect(res.statusCode).toBe(503);
    expectApiError(res);
  });
});
