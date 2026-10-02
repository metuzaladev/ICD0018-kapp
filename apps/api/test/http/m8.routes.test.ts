import { createServer, type Server, type Socket } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { createRateLimitRedis } from '../../src/lib/redis-clients';
import { buildTestApp } from '../helpers';
import { expectApiError } from './expect-api-error';

/**
 * M8 production behaviour that needs no real infrastructure: client IPs behind a proxy and the
 * Redis rate-limit store failing open. Shared counters across instances are tested against a real
 * Redis in test/integration/scale-out.test.ts.
 */

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;
let ctx: TestApp | undefined;
const cleanups: (() => Promise<unknown>)[] = [];

afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
  for (const fn of cleanups.splice(0)) await fn();
});

const url = '/api/v1/parks/nearby?lat=59&lng=24';
const silentLog = { warn: () => {} };

describe('TRUST_PROXY and rate limits', () => {
  it('with a trusted hop, limits each forwarded client separately', async () => {
    ctx = await buildTestApp({}, { rateLimitMax: 1, trustProxy: 1 });
    const from = (ip: string) => ctx!.app.inject({ method: 'GET', url, headers: { 'x-forwarded-for': ip } });

    expect((await from('198.51.100.1')).statusCode).toBe(200);
    expect((await from('198.51.100.2')).statusCode).toBe(200);
    const res = await from('198.51.100.1');
    expect(res.statusCode).toBe(429);
    expectApiError(res);
  });

  it('without trust (default), a spoofed X-Forwarded-For does not escape the limit', async () => {
    ctx = await buildTestApp({}, { rateLimitMax: 1 });
    const from = (ip: string) => ctx!.app.inject({ method: 'GET', url, headers: { 'x-forwarded-for': ip } });

    expect((await from('198.51.100.1')).statusCode).toBe(200);
    expect((await from('198.51.100.2')).statusCode).toBe(429);
  });

  it('trusts only listed proxy addresses', async () => {
    ctx = await buildTestApp({}, { rateLimitMax: 1, trustProxy: ['10.0.0.0/8'] });
    const via = (remoteAddress: string, ip: string) => ctx!.app.inject({ method: 'GET', url, remoteAddress, headers: { 'x-forwarded-for': ip } });

    expect((await via('10.1.2.3', '198.51.100.1')).statusCode).toBe(200);
    expect((await via('10.1.2.3', '198.51.100.2')).statusCode).toBe(200);
    // Not from the load balancer: the header is ignored and the caller's own address counts.
    expect((await via('203.0.113.9', '198.51.100.3')).statusCode).toBe(200);
    expect((await via('203.0.113.9', '198.51.100.4')).statusCode).toBe(429);
  });
});

describe('Redis rate-limit store fails open', () => {
  it('serves requests when Redis refuses connections', async () => {
    const redis = createRateLimitRedis('redis://127.0.0.1:1', silentLog);
    cleanups.push(async () => redis.disconnect());
    ctx = await buildTestApp({}, { rateLimitMax: 1, rateLimitRedis: redis });

    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await ctx.app.inject({ method: 'GET', url })).statusCode);

    expect(statuses).toEqual([200, 200, 200]);
  });

  it('does not hang when Redis accepts the connection but never answers (timeout)', async () => {
    const sockets: Socket[] = [];
    const blackhole: Server = createServer((s) => void sockets.push(s));
    await new Promise<void>((resolve) => blackhole.listen(0, '127.0.0.1', resolve));
    const { port } = blackhole.address() as { port: number };
    cleanups.push(
      () =>
        new Promise((resolve) => {
          for (const s of sockets) s.destroy();
          blackhole.close(resolve);
        }),
    );
    const redis = createRateLimitRedis(`redis://127.0.0.1:${port}`, silentLog, { commandTimeoutMs: 200 });
    cleanups.push(async () => redis.disconnect());
    ctx = await buildTestApp({}, { rateLimitMax: 1, rateLimitRedis: redis });

    const started = Date.now();
    const res = await ctx.app.inject({ method: 'GET', url });

    expect(res.statusCode).toBe(200);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
