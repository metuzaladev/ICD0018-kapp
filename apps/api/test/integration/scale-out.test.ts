import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { REALTIME_PATH } from '@kapp/shared';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, describe, expect, it } from 'vitest';

import { env } from '../../src/config/env';
import { createRateLimitRedis, createRealtimeRedisAdapter } from '../../src/lib/redis-clients';
import { createSocketGateway, type SocketGateway } from '../../src/realtime/socket-gateway';
import { buildTestApp } from '../helpers';

/**
 * Two API instances sharing one Redis (M8, docs/15): rate-limit counters and Socket.IO emits must
 * work across instances. Uses the Redis from docker-compose.yml / CI; every test uses its own keys
 * and removes them.
 */

const silentLog = { warn: () => {} };
const cleanups: (() => Promise<unknown>)[] = [];
afterAll(async () => {
  for (const fn of cleanups.reverse()) await fn();
});

describe('rate limits shared through Redis', () => {
  it('counts requests to both instances together', async () => {
    // A unique client address keeps this test's counter apart from other runs.
    const clientIp = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
    const redisA = createRateLimitRedis(env.REDIS_URL, silentLog);
    const redisB = createRateLimitRedis(env.REDIS_URL, silentLog);
    // No offline queue: wait until both are connected before counting.
    await Promise.all([redisA, redisB].map((r) => new Promise((resolve) => (r.status === 'ready' ? resolve(null) : r.once('ready', resolve)))));
    const a = await buildTestApp({}, { rateLimitMax: 3, trustProxy: true, rateLimitRedis: redisA });
    const b = await buildTestApp({}, { rateLimitMax: 3, trustProxy: true, rateLimitRedis: redisB });
    cleanups.push(async () => {
      await Promise.all([a.app.close(), b.app.close()]);
      const keys = await redisA.keys(`kapp:rate-limit:*${clientIp}*`);
      if (keys.length > 0) await redisA.del(...keys);
      await Promise.all([redisA.quit(), redisB.quit()]);
    });

    const url = '/api/v1/parks/nearby?lat=59&lng=24';
    const headers = { 'x-forwarded-for': clientIp };
    const statuses = [];
    for (const app of [a.app, b.app, a.app, b.app]) statuses.push((await app.inject({ method: 'GET', url, headers })).statusCode);

    // With in-memory counters this would be [200, 200, 200, 200] (two per instance, under the limit).
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe('Socket.IO Redis adapter', () => {
  /** One "API instance": a gateway with the Redis adapter on its own HTTP server. */
  async function startInstance(key: string): Promise<{ gateway: SocketGateway; url: string }> {
    const adapter = createRealtimeRedisAdapter(env.REDIS_URL, silentLog, key);
    const gateway = createSocketGateway({ adapter: adapter.adapter });
    const server: Server = createServer();
    gateway.attach(server, {
      corsOrigins: [],
      // Stands in for the Better Auth session: the handshake header names the user.
      resolveUserId: async ({ headers }) => (typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null),
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(async () => {
      await gateway.close();
      await new Promise((resolve) => server.close(resolve));
      await adapter.close();
    });
    return { gateway, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  }

  async function connectAs(url: string, userId: string): Promise<Socket> {
    const client = connect(url, { path: REALTIME_PATH, transports: ['websocket'], extraHeaders: { 'x-test-user': userId } });
    cleanups.push(async () => void client.close());
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    return client;
  }

  it('delivers an emit from instance B to a user connected to instance A', async () => {
    const key = `kapp-test-${randomUUID()}:socket.io`;
    const instanceA = await startInstance(key);
    const instanceB = await startInstance(key);
    const client = await connectAs(instanceA.url, 'user-a');

    // The room membership lives on A, yet B sees it through Redis.
    await expect.poll(() => instanceB.gateway.connectionCount('user-a'), { timeout: 3000 }).toBe(1);

    const received = new Promise<unknown>((resolve) => client.once('notification:new', resolve));
    instanceB.gateway.emitToUsers(['user-a'], 'notification:new', { unreadCount: 3 } as never);

    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('emit not delivered')), 3000));
    await expect(Promise.race([received, timeout])).resolves.toEqual({ unreadCount: 3 });
  });

  it('instances on different channels do not see each other (why the shared adapter is needed)', async () => {
    const instanceA = await startInstance(`kapp-test-${randomUUID()}:socket.io`);
    const instanceB = await startInstance(`kapp-test-${randomUUID()}:socket.io`);
    await connectAs(instanceA.url, 'user-b');

    expect(await instanceA.gateway.connectionCount('user-b')).toBe(1);
    expect(await instanceB.gateway.connectionCount('user-b')).toBe(0);
  });

  it('closing the adapter twice does not throw (shutdown after an outage)', async () => {
    const adapter = createRealtimeRedisAdapter(env.REDIS_URL, silentLog, `kapp-test-${randomUUID()}:socket.io`);
    await adapter.close();
    await expect(adapter.close()).resolves.toBeUndefined();
  });
});
