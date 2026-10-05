/**
 * Production migration command (M8): `node dist/migrate.js` in the API image, run once per release
 * as a separate step before the new version starts — see docs/15-pakendamine-ja-levitamine.md.
 *
 * Why not migrate on every boot: with several instances (or a rolling deploy) each would race to
 * migrate the same database; a failed migration would crash-loop every instance instead of failing
 * one visible release step; and the runtime database user should not need DDL rights. Why not
 * drizzle-kit: it is a dev tool with a large dependency tree; drizzle-orm's migrator (already a
 * runtime dependency) applies the same SQL files and records them in the same
 * `drizzle.__drizzle_migrations` table, so development (drizzle-kit) and production agree.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export interface MigrateOptions {
  databaseUrl: string;
  /** Folder with the generated SQL and meta/_journal.json (apps/api/drizzle). */
  migrationsFolder: string;
  connectionTimeoutMs?: number;
}

export async function runMigrations({ databaseUrl, migrationsFolder, connectionTimeoutMs = 10_000 }: MigrateOptions): Promise<void> {
  // Own pool without the API's 5 s statement_timeout: building an index on a big table may take longer.
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: connectionTimeoutMs });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

/** True when this file is the process entry point (node dist/migrate.js / tsx src/db/migrate.ts). */
const isEntryPoint = process.argv[1] !== undefined && /migrate\.(js|ts)$/.test(process.argv[1]);

if (isEntryPoint) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(JSON.stringify({ level: 'error', msg: 'DATABASE_URL is required' }));
    process.exit(1);
  }
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? 'drizzle';
  runMigrations({ databaseUrl, migrationsFolder }).then(
    () => console.log(JSON.stringify({ level: 'info', msg: 'migrations applied', migrationsFolder })),
    (err: unknown) => {
      // The message only: a pg error can contain the connection string with the password.
      console.error(JSON.stringify({ level: 'error', msg: 'migration failed', error: err instanceof Error ? err.message : String(err) }));
      process.exit(1);
    },
  );
}
