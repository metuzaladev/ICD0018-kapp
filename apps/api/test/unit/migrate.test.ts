import { describe, expect, it } from 'vitest';

import { runMigrations } from '../../src/db/migrate';

describe('runMigrations (production migrate command)', () => {
  it('fails (and does not hang) when the database is unreachable', async () => {
    const started = Date.now();
    await expect(runMigrations({ databaseUrl: 'postgres://kapp:kapp@127.0.0.1:1/kapp', migrationsFolder: 'drizzle', connectionTimeoutMs: 500 })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('fails when the migrations folder is missing (broken image)', async () => {
    await expect(runMigrations({ databaseUrl: 'postgres://kapp:kapp@127.0.0.1:1/kapp', migrationsFolder: 'does-not-exist' })).rejects.toThrow();
  });
});
