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

/** `KEY=` in a .env file arrives as "" — treat it as "not set" so .env.example can be copied as-is. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

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

  /* ---- authentication (Better Auth) ---- */

  /** Signs session cookies. Must be a long random value in production: `openssl rand -base64 32`. */
  BETTER_AUTH_SECRET: optional(z.string().min(32)),
  /** Public URL of this API — used to build links in emails and OAuth callbacks. */
  API_PUBLIC_URL: z.url().default('http://localhost:3000'),
  /** Deep-link scheme of the mobile app (app.json → expo.scheme). */
  APP_SCHEME: z.string().regex(/^[a-z][a-z0-9+.-]*$/).default('kapp'),

  /** Sign in with Apple — enabled only when all three are set (see docs/07-autentimine.md). */
  APPLE_CLIENT_ID: optional(z.string().min(1)),
  APPLE_CLIENT_SECRET: optional(z.string().min(1)),
  APPLE_APP_BUNDLE_ID: optional(z.string().min(1)),
  /** Google sign-in — enabled only when both are set. */
  GOOGLE_CLIENT_ID: optional(z.string().min(1)),
  GOOGLE_CLIENT_SECRET: optional(z.string().min(1)),
});

/** Fixed dev/test secret so sessions survive restarts locally. Rejected in production below. */
const DEV_AUTH_SECRET = 'dev-only-insecure-secret-do-not-use-in-production';

function loadEnv() {
  const parsed = envSchema.parse(process.env);
  if (parsed.NODE_ENV === 'production' && !parsed.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is required in production');
  }
  return { ...parsed, BETTER_AUTH_SECRET: parsed.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET };
}

export type Env = ReturnType<typeof loadEnv>;
export const env: Env = loadEnv();
