import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://kapp:kapp@localhost:5432/kapp',
  },
  // Skip PostGIS' own tables when diffing the schema.
  extensionsFilters: ['postgis'],
});
