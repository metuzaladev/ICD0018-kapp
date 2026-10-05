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
import { createServices, createStorageFromEnv } from './services';

const isProduction = env.NODE_ENV === 'production';
const logger = pino({
  level: isProduction ? 'info' : 'debug',
  // Never write credentials to logs.
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
});

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
const realtime = createSocketGateway();
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
    bodyLimitBytes: env.BODY_LIMIT_BYTES,
    logger,
  },
);

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  await app.close(); // stops accepting requests and waits for in-flight ones (and closes sockets)
  await pushWorker?.close(); // lets the running push job finish; unfinished jobs stay in Redis
  await reminderWorker?.close();
  await pushQueue.close();
  await bookingReminders.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: env.HOST, port: env.PORT });
