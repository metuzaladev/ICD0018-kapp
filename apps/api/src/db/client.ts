import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from '../config/env';
import * as schema from './schema';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  // Fail fast when the database is unreachable instead of queueing requests indefinitely.
  connectionTimeoutMillis: 3000,
  // Postgres cancels any statement running longer than this (SQLSTATE 57014 → HTTP 503).
  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;
