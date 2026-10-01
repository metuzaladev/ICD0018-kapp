import { z } from 'zod';

/**
 * All runtime configuration in one validated object.
 * Why: a typo or missing variable must crash at startup, not surface as a 500 in production.
 */

// Load apps/api/.env when present (Node >= 21.7); variables already in the environment win.
try {
  process.loadEnvFile();
} catch {
  // No .env file — rely on the environment and defaults.
}

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url().default('postgres://kapp:kapp@localhost:5432/kapp'),

  /** Comma-separated browser origins allowed by CORS. Native apps send no Origin and are unaffected. */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  /** Set to true only behind a trusted reverse proxy, otherwise X-Forwarded-For can be spoofed. */
  TRUST_PROXY: booleanFromString,

  /** Hard upper bound for a single SQL statement; Postgres cancels it after this. */
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  /** Upper bound for a whole service call (may include several queries or external calls). */
  SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  /** Requests per minute per client IP. */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  /** JSON body limit in bytes. Images never go through the API (presigned uploads), so this stays small. */
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(64 * 1024),
});

export type Env = z.infer<typeof envSchema>;
export const env: Env = envSchema.parse(process.env);
