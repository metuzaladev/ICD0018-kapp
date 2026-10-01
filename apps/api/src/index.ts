/**
 * Composition root: the only place that creates real infrastructure (database pool, logger)
 * and wires it into the application. Everything below receives its dependencies as arguments.
 */
import { sql } from 'drizzle-orm';

import { buildApp } from './app';
import { env } from './config/env';
import { db, pool } from './db/client';
import { createParksRepository } from './modules/parks/parks.repository';
import { createParksService } from './modules/parks/parks.service';

const app = await buildApp(
  {
    parksService: createParksService({ repository: createParksRepository(db), timeoutMs: env.SERVICE_TIMEOUT_MS }),
    checkDatabase: async () => {
      await db.execute(sql`select 1`);
      return true;
    },
  },
  {
    corsOrigins: env.CORS_ORIGINS,
    trustProxy: env.TRUST_PROXY,
    rateLimitMax: env.RATE_LIMIT_MAX,
    bodyLimitBytes: env.BODY_LIMIT_BYTES,
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      // Never write credentials to logs.
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
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
