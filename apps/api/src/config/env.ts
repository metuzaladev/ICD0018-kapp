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

/** `KEY=` in a .env file arrives as "" — treat it as "not set" so .env.example can be copied as-is. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

/**
 * A URL with a docker-compose default. Empty counts as unset too, so in production the clear
 * "X is required" message from productionConfigProblems appears instead of a URL parse error.
 */
const urlWithDevDefault = (fallback: string) => z.preprocess((v) => (v === '' ? undefined : v), z.url().default(fallback));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: urlWithDevDefault('postgres://kapp:kapp@localhost:5432/kapp'),

  /** Comma-separated browser origins allowed by CORS. Native apps send no Origin and are unaffected. */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  /**
   * Which X-Forwarded-For hops to trust (client IP for rate limits, https detection). `false`
   * (default) when clients connect directly; behind a load balancer prefer the number of proxies
   * (`1`) or their addresses/CIDRs (`10.0.0.0/8,172.16.0.0/12`) over `true`, which trusts any
   * hop — and lets a client that reaches the server directly spoof its IP. See parseTrustProxy.
   */
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((v, ctx) => {
      const parsed = parseTrustProxy(v);
      if (parsed === null) {
        ctx.addIssue({ code: 'custom', message: 'TRUST_PROXY must be true, false, a hop count or a comma-separated list of IPs/CIDRs' });
        return z.NEVER;
      }
      return parsed;
    }),

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
  API_PUBLIC_URL: urlWithDevDefault('http://localhost:3000'),
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
  S3_ENDPOINT: urlWithDevDefault('http://localhost:9000'),
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
  REDIS_URL: urlWithDevDefault('redis://localhost:6379'),
  /** Namespaces the queue's Redis keys, so several environments (or tests) can share one Redis. */
  PUSH_QUEUE_PREFIX: z.string().regex(/^[a-z0-9:_-]+$/).default('kapp'),
  /**
   * Optional Expo access token. Needed only when "Enhanced security for push notifications" is
   * enabled for the Expo project; without it the Expo push service accepts any valid token.
   */
  EXPO_ACCESS_TOKEN: optional(z.string().min(1)),
  /**
   * Runs the BullMQ workers (push, booking reminders, and since M10 email and storage cleanup) in the
   * API process. Set false when a separate worker process takes over.
   */
  PUSH_WORKER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /* ---- email (M10, docs/17-konto-privaatsus-e-post.md) ---- */

  /**
   * Who delivers password-reset, confirmation and deletion emails. `log` (development default)
   * only logs; production must use `smtp` (any SMTP server) or `resend` (HTTP API).
   */
  MAIL_PROVIDER: z.enum(['log', 'smtp', 'resend']).default('log'),
  /** Sender, e.g. `Käpp <noreply@kapp.example>`. The domain needs SPF and DKIM for the provider (docs/17). */
  MAIL_FROM: optional(z.string().trim().min(3).max(200)),
  /** smtp(s)://user:password@host:port — a secret, keep it out of the repository. */
  SMTP_URL: optional(z.string().regex(/^smtps?:\/\/\S+$/, 'SMTP_URL must start with smtp:// or smtps://')),
  /** Resend API key (re_…), sending-only permission. */
  RESEND_API_KEY: optional(z.string().min(1)),

  /* ---- running more than one instance (M8, docs/15-pakendamine-ja-levitamine.md) ---- */

  /**
   * Where rate-limit counters live. `memory` is right for one instance; with several instances
   * each would count separately (N × the limit), so set `redis` to share counters in REDIS_URL.
   */
  RATE_LIMIT_STORE: z.enum(['memory', 'redis']).default('memory'),
  /**
   * Socket.IO adapter. `memory` reaches only sockets on this instance; with several instances set
   * `redis` so an emit (new message, notification) reaches users connected to the other ones.
   */
  REALTIME_ADAPTER: z.enum(['memory', 'redis']).default('memory'),
  /** Deadline for closing everything on SIGTERM; keep it below the platform's grace period. */
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(9000),
  /** pino level; defaults to info in production and debug elsewhere. */
  LOG_LEVEL: optional(z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])),
});

/**
 * TRUST_PROXY → Fastify's `trustProxy`: true/false, a hop count, or a list of trusted proxy
 * addresses/CIDRs. Returns null for anything else so a typo fails at startup.
 */
export function parseTrustProxy(value: string): boolean | number | string[] | null {
  const v = value.trim();
  if (v === 'true') return true;
  if (v === 'false' || v === '') return false;
  if (/^\d+$/.test(v)) return Number(v);
  const list = v.split(',').map((s) => s.trim()).filter(Boolean);
  const ipOrCidr = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]+)(\/\d{1,3})?$/i;
  return list.length > 0 && list.every((s) => ipOrCidr.test(s)) ? list : null;
}

type ParsedEnv = z.infer<typeof envSchema>;

/** Settings whose development defaults point at localhost and therefore must be set explicitly. */
const REQUIRED_IN_PRODUCTION = ['DATABASE_URL', 'REDIS_URL', 'API_PUBLIC_URL', 'S3_ENDPOINT', 'BETTER_AUTH_SECRET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;

/**
 * Everything wrong with a production configuration, reported at once (fixing one variable per
 * failed deploy is slow). Why each rule:
 * - defaults are for docker-compose on a laptop; in production they would silently connect to a
 *   localhost database or sign cookies with the public dev secret;
 * - API_PUBLIC_URL must be https: it builds password-reset and OAuth links, and Better Auth sets
 *   Secure cookies in production;
 * - TRUST_PROXY=true behind a platform's load balancer is common, but it is the one value that
 *   makes rate limits spoofable, so it is allowed with a warning (returned separately).
 */
export function productionConfigProblems(parsed: ParsedEnv, source: Record<string, string | undefined>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (parsed.NODE_ENV !== 'production') return { errors, warnings };

  for (const key of REQUIRED_IN_PRODUCTION) {
    if (!source[key]) errors.push(`${key} is required in production`);
  }
  if (source.API_PUBLIC_URL && !parsed.API_PUBLIC_URL.startsWith('https://')) {
    errors.push('API_PUBLIC_URL must use https in production');
  }
  if (parsed.BETTER_AUTH_SECRET === DEV_AUTH_SECRET) errors.push('BETTER_AUTH_SECRET must not be the development secret');
  if (parsed.S3_SECRET_ACCESS_KEY === DEV_S3_SECRET_ACCESS_KEY) errors.push('S3_SECRET_ACCESS_KEY must not be the development MinIO secret');
  if (parsed.CORS_ORIGINS.some((o) => o === '*' || !o.startsWith('https://'))) {
    errors.push('CORS_ORIGINS must list https origins only (no "*") in production');
  }
  if (parsed.MAIL_PROVIDER === 'log') {
    errors.push('MAIL_PROVIDER must be smtp or resend in production (log delivers no password-reset or confirmation email)');
  }
  if (!parsed.MAIL_FROM) errors.push('MAIL_FROM is required in production');
  if (parsed.TRUST_PROXY === true) {
    warnings.push('TRUST_PROXY=true trusts every X-Forwarded-For hop; prefer a hop count or proxy CIDRs');
  }
  return { errors, warnings };
}

/** Fixed dev/test secret so sessions survive restarts locally. Rejected in production below. */
const DEV_AUTH_SECRET = 'dev-only-insecure-secret-do-not-use-in-production';
/** MinIO root credentials from docker-compose.yml (development only). */
const DEV_S3_ACCESS_KEY_ID = 'kapp';
const DEV_S3_SECRET_ACCESS_KEY = 'kapp-dev-secret';

/**
 * Parses and checks the configuration. Takes the source as an argument so tests can check the
 * production rules without touching process.env.
 */
/** Provider settings that are wrong in every environment (a chosen provider without its credentials). */
export function mailConfigProblems(parsed: Pick<ParsedEnv, 'MAIL_PROVIDER' | 'SMTP_URL' | 'RESEND_API_KEY'>): string[] {
  if (parsed.MAIL_PROVIDER === 'smtp' && !parsed.SMTP_URL) return ['SMTP_URL is required when MAIL_PROVIDER=smtp'];
  if (parsed.MAIL_PROVIDER === 'resend' && !parsed.RESEND_API_KEY) return ['RESEND_API_KEY is required when MAIL_PROVIDER=resend'];
  return [];
}

export function loadEnv(source: Record<string, string | undefined> = process.env) {
  const parsed = envSchema.parse(source);
  const mailProblems = mailConfigProblems(parsed);
  if (mailProblems.length > 0 && parsed.NODE_ENV !== 'production') throw new Error(`Invalid email configuration:\n- ${mailProblems.join('\n- ')}`);
  const production = productionConfigProblems(parsed, source);
  const errors = [...production.errors, ...(parsed.NODE_ENV === 'production' ? mailProblems : [])];
  const { warnings } = production;
  if (errors.length > 0) {
    throw new Error(`Invalid production configuration:\n- ${errors.join('\n- ')}`);
  }
  return {
    ...parsed,
    /** Logged once at startup by index.ts (the logger does not exist yet here). */
    CONFIG_WARNINGS: warnings,
    BETTER_AUTH_SECRET: parsed.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET,
    S3_PUBLIC_ENDPOINT: parsed.S3_PUBLIC_ENDPOINT ?? parsed.S3_ENDPOINT,
    S3_ACCESS_KEY_ID: parsed.S3_ACCESS_KEY_ID ?? DEV_S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: parsed.S3_SECRET_ACCESS_KEY ?? DEV_S3_SECRET_ACCESS_KEY,
  };
}

export type Env = ReturnType<typeof loadEnv>;
export const env: Env = loadEnv();
