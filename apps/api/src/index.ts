/**
 * Composition root: the only place that creates real infrastructure (database pool, object
 * storage, auth, mailer, logger) and wires it into the application. Everything else receives its
 * dependencies as arguments.
 */
import { sql } from 'drizzle-orm';
import pino from 'pino';

import { buildApp } from './app';
import { env } from './config/env';
import { db, pool } from './db/client';
import { createAuth } from './modules/auth/auth';
import { createBookingReminderQueue, startBookingReminderWorker } from './modules/bookings/booking-reminders';
import { createLogMailer } from './modules/auth/mailer';
import { createSessionResolver } from './modules/auth/session-resolver';
import { createPushTokensRepository } from './modules/notifications/notifications.repository';
import { createPushQueue, startPushWorker } from './modules/notifications/push-queue';
import { createExpoPushClient, createPushProcessor } from './modules/notifications/push-worker';
import { createSocketGateway } from './realtime/socket-gateway';
import { createShutdown, type ShutdownStep } from './lib/graceful-shutdown';
import { serializeReply, serializeRequest } from './lib/log-serializers';
import { createRateLimitRedis, createRealtimeRedisAdapter } from './lib/redis-clients';
import { createServices, createStorageFromEnv } from './services';

const isProduction = env.NODE_ENV === 'production';
// JSON lines on stdout: the container platform collects them (docs/15). No personal data:
// request logs keep method + path only (lib/log-serializers.ts), credentials are redacted anyway.
const logger = pino({
  level: env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  serializers: { req: serializeRequest, res: serializeReply },
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
});
for (const warning of env.CONFIG_WARNINGS) logger.warn(warning);

const auth = createAuth({
  db,
  mailer: createLogMailer(logger, isProduction),
  config: {
    secret: env.BETTER_AUTH_SECRET,
    publicUrl: env.API_PUBLIC_URL,
    appScheme: env.APP_SCHEME,
    isProduction,
    rateLimit: env.NODE_ENV !== 'test',
    apple:
      env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET && env.APPLE_APP_BUNDLE_ID
        ? { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET, appBundleIdentifier: env.APPLE_APP_BUNDLE_ID }
        : undefined,
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : undefined,
  },
});

// M5: realtime (Socket.IO on the same server) and the push pipeline (BullMQ + Expo), docs/12.
// Several instances share emits through Redis (REALTIME_ADAPTER=redis), see lib/redis-clients.ts.
const realtimeAdapter = env.REALTIME_ADAPTER === 'redis' ? createRealtimeRedisAdapter(env.REDIS_URL, logger, `${env.PUSH_QUEUE_PREFIX}:socket.io`) : null;
const realtime = createSocketGateway({ adapter: realtimeAdapter?.adapter });
const rateLimitRedis = env.RATE_LIMIT_STORE === 'redis' ? createRateLimitRedis(env.REDIS_URL, logger) : undefined;
const queueConnection = { url: env.REDIS_URL, prefix: env.PUSH_QUEUE_PREFIX };
const pushQueue = createPushQueue(queueConnection);
const pushWorker = env.PUSH_WORKER_ENABLED
  ? startPushWorker(
      queueConnection,
      createPushProcessor({
        tokens: createPushTokensRepository(db),
        client: createExpoPushClient({ accessToken: env.EXPO_ACCESS_TOKEN }),
        scheduleReceipts: (job) => pushQueue.scheduleReceipts(job),
      }),
      logger,
    )
  : null;

// M6: booking reminders are delayed jobs in the same Redis; the worker shares PUSH_WORKER_ENABLED
// because it only ends in a push (docs/13-teenused.md).
const bookingReminders = createBookingReminderQueue(queueConnection);
const services = createServices(db, createStorageFromEnv(env), env.SERVICE_TIMEOUT_MS, { realtime, pushQueue, bookingReminders, log: logger });
const reminderWorker = env.PUSH_WORKER_ENABLED
  ? startBookingReminderWorker(queueConnection, (bookingId) => services.bookingsService.sendReminder(bookingId), logger)
  : null;

const app = await buildApp(
  {
    ...services,
    realtime,
    checkDatabase: async () => {
      await db.execute(sql`select 1`);
      return true;
    },
    resolveUserId: createSessionResolver(auth),
    authHandler: auth.handler,
  },
  {
    corsOrigins: env.CORS_ORIGINS,
    trustProxy: env.TRUST_PROXY,
    rateLimitMax: env.RATE_LIMIT_MAX,
    rateLimitRedis,
    bodyLimitBytes: env.BODY_LIMIT_BYTES,
    logger,
  },
);

// Order matters (lib/graceful-shutdown.ts): stop HTTP + sockets first, then let running jobs
// finish, then close queues and connections. Steps for disabled features are left out.
const steps: (ShutdownStep | null)[] = [
  { name: 'http', close: () => app.close() }, // stops accepting, waits for in-flight requests, closes sockets
  pushWorker && { name: 'push worker', close: () => pushWorker.close() }, // unfinished jobs stay in Redis
  reminderWorker && { name: 'reminder worker', close: () => reminderWorker.close() },
  { name: 'push queue', close: () => pushQueue.close() },
  { name: 'reminder queue', close: () => bookingReminders.close() },
  realtimeAdapter && { name: 'realtime redis', close: () => realtimeAdapter.close() },
  rateLimitRedis ? { name: 'rate limit redis', close: () => rateLimitRedis.quit() } : null,
  { name: 'database', close: () => pool.end() },
];
const shutdown = createShutdown({
  steps: steps.filter((s): s is ShutdownStep => s !== null),
  timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
  log: logger,
  exit: (code) => process.exit(code),
});
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: env.HOST, port: env.PORT });
