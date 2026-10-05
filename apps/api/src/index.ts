/**
 * Composition root: the only place that creates real infrastructure (database pool, auth,
 * mailer, logger) and wires it into the application. Everything else receives its
 * dependencies as arguments.
 */
import { sql } from 'drizzle-orm';
import pino from 'pino';

import { buildApp } from './app';
import { env } from './config/env';
import { db, pool } from './db/client';
import { createAuth } from './modules/auth/auth';
import { createLogMailer } from './modules/auth/mailer';
import { createSessionResolver } from './modules/auth/session-resolver';
import { createServices } from './services';

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

const app = await buildApp(
  {
    ...createServices(db, env.SERVICE_TIMEOUT_MS),
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
  await app.close(); // stops accepting requests and waits for in-flight ones
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: env.HOST, port: env.PORT });
