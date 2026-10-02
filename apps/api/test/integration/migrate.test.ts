import { describe, expect, it } from 'vitest';

import { env } from '../../src/config/env';
import { runMigrations } from '../../src/db/migrate';

describe('runMigrations against the real database', () => {
  // CI and development migrate with drizzle-kit first; the production migrator must agree with it
  // (same journal table) and therefore find nothing left to do.
  it('is idempotent on a database migrated by drizzle-kit', async () => {
    await expect(runMigrations({ databaseUrl: env.DATABASE_URL, migrationsFolder: 'drizzle' })).resolves.toBeUndefined();
    await expect(runMigrations({ databaseUrl: env.DATABASE_URL, migrationsFolder: 'drizzle' })).resolves.toBeUndefined();
  });
});
