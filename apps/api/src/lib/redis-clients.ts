import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';

/**
 * Redis connections for running several API instances (M8, docs/15-pakendamine-ja-levitamine.md).
 * The BullMQ queues open their own connections (push-queue.ts); these are separate because each
 * use needs different failure behaviour.
 */

interface WarnLog {
  warn(obj: object, msg: string): void;
}

/**
 * Shared rate-limit counters. Tuned to fail fast: no offline queue and a short command timeout,
 * so a dead or slow Redis makes the limiter error at once — and @fastify/rate-limit's
 * `skipOnError` then lets the request through. Why fail open: the limit is abuse protection, not
 * a correctness rule; Redis being down must not turn into the whole API answering 500.
 */
export function createRateLimitRedis(url: string, log: WarnLog, options: { commandTimeoutMs?: number } = {}): Redis {
  const redis = new Redis(url, {
    connectTimeout: 2000,
    commandTimeout: options.commandTimeoutMs ?? 500,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  // Without a listener ioredis prints "Unhandled error event" for every reconnect attempt.
  redis.on('error', (err) => log.warn({ err }, 'rate limit redis error'));
  return redis;
}

/**
 * Socket.IO Redis adapter: emits are published to Redis and every instance delivers them to its
 * own sockets. Pub/sub needs two connections (a subscribed connection cannot publish). Emits are
 * fire-and-forget, so the default offline queue is kept: during a short Redis outage they are
 * delivered after reconnecting, and the app's 15 s polling covers anything lost (docs/12).
 */
export function createRealtimeRedisAdapter(url: string, log: WarnLog, key = 'kapp:socket.io') {
  const pub = new Redis(url, { connectTimeout: 2000 });
  const sub = pub.duplicate();
  pub.on('error', (err) => log.warn({ err }, 'realtime redis (pub) error'));
  sub.on('error', (err) => log.warn({ err }, 'realtime redis (sub) error'));
  return {
    adapter: createAdapter(pub, sub, { key }),
    async close() {
      await Promise.allSettled([pub.quit(), sub.quit()]);
    },
  };
}
