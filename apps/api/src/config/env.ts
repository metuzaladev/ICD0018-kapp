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

  /* ---- object storage for dog photos (S3 API: MinIO in development, Cloudflare R2 in production) ---- */

  /** Where the API itself reaches the storage (inside Docker/the server network). */
  S3_ENDPOINT: z.url().default('http://localhost:9000'),
  /**
   * Where phones reach the storage. Presigned URLs are signed for this host (the host is part of
   * the signature), so it must be the address the device uses — e.g. http://<computer-IP>:9000 on
   * a real phone. Defaults to S3_ENDPOINT.
   */
  S3_PUBLIC_ENDPOINT: optional(z.url()),
  /** R2 uses "auto"; MinIO accepts any region. */
  S3_REGION: z.string().min(1).default('us-east-1'),
  /** Private bucket: objects are only readable through short-lived signed URLs. */
  S3_BUCKET: z.string().min(3).max(63).default('kapp-photos'),
  /** Dev defaults match docker-compose.yml; production must set real credentials (checked below). */
  S3_ACCESS_KEY_ID: optional(z.string().min(1)),
  S3_SECRET_ACCESS_KEY: optional(z.string().min(1)),
  /** MinIO needs path-style URLs (http://host/bucket/key); R2 works with both. */
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /* ---- realtime and push notifications (M5, docs/12-kogukond.md) ---- */

  /** Redis for the BullMQ push queue (docker-compose.yml locally). */
  REDIS_URL: z.url().default('redis://localhost:6379'),
  /** Namespaces the queue's Redis keys, so several environments (or tests) can share one Redis. */
  PUSH_QUEUE_PREFIX: z.string().regex(/^[a-z0-9:_-]+$/).default('kapp'),
  /**
   * Optional Expo access token. Needed only when "Enhanced security for push notifications" is
   * enabled for the Expo project; without it the Expo push service accepts any valid token.
   */
  EXPO_ACCESS_TOKEN: optional(z.string().min(1)),
  /** Runs the push worker in the API process. Set false when a separate worker process takes over. */
  PUSH_WORKER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

/** Fixed dev/test secret so sessions survive restarts locally. Rejected in production below. */
const DEV_AUTH_SECRET = 'dev-only-insecure-secret-do-not-use-in-production';
/** MinIO root credentials from docker-compose.yml (development only). */
const DEV_S3_ACCESS_KEY_ID = 'kapp';
const DEV_S3_SECRET_ACCESS_KEY = 'kapp-dev-secret';

function loadEnv() {
  const parsed = envSchema.parse(process.env);
  if (parsed.NODE_ENV === 'production' && !parsed.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is required in production');
  }
  if (parsed.NODE_ENV === 'production' && (!parsed.S3_ACCESS_KEY_ID || !parsed.S3_SECRET_ACCESS_KEY)) {
    throw new Error('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required in production');
  }
  return {
    ...parsed,
    BETTER_AUTH_SECRET: parsed.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET,
    S3_PUBLIC_ENDPOINT: parsed.S3_PUBLIC_ENDPOINT ?? parsed.S3_ENDPOINT,
    S3_ACCESS_KEY_ID: parsed.S3_ACCESS_KEY_ID ?? DEV_S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: parsed.S3_SECRET_ACCESS_KEY ?? DEV_S3_SECRET_ACCESS_KEY,
  };
}

export type Env = ReturnType<typeof loadEnv>;
export const env: Env = loadEnv();
