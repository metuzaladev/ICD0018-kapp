import { expo } from '@better-auth/expo';
import { DEFAULT_LANGUAGE, isLanguage, LEGAL_VERSIONS, PASSWORD_MAX, PASSWORD_MIN, signUpInputSchema, type Language } from '@kapp/shared';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';

import type { Db } from '../../db/client';
import { account, session, user, verification } from '../../db/schema';
import { EMAIL_VERIFIED_PATH } from '../legal/legal-html';
import type { Mailer } from '../mail/mailer';

/**
 * Better Auth configuration — sessions, password hashing (scrypt), social sign-in.
 *
 * Why Better Auth instead of hand-written auth: password hashing, session rotation, OAuth state
 * and token verification are easy to get subtly wrong. It stores everything in our own Postgres
 * (no external auth vendor) and has first-class Expo support.
 */

export const AUTH_BASE_PATH = '/api/v1/auth';

export interface AuthConfig {
  secret: string;
  publicUrl: string;
  appScheme: string;
  isProduction: boolean;
  /** Better Auth's own limiter (stricter rules for sign-in). Off in tests to keep them deterministic. */
  rateLimit: boolean;
  apple?: { clientId: string; clientSecret: string; appBundleIdentifier: string };
  google?: { clientId: string; clientSecret: string };
}

const languageOf = (user: object): Language => {
  const language = (user as { language?: unknown }).language;
  return isLanguage(language) ? language : DEFAULT_LANGUAGE;
};

export function createAuth({ db, config, mailer }: { db: Db; config: AuthConfig; mailer: Mailer }) {
  const socialProviders: Parameters<typeof betterAuth>[0]['socialProviders'] = {};
  if (config.apple) socialProviders.apple = config.apple;
  if (config.google) socialProviders.google = config.google;

  return betterAuth({
    appName: 'Käpp',
    baseURL: config.publicUrl,
    basePath: AUTH_BASE_PATH,
    secret: config.secret,
    telemetry: { enabled: false },
    database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      autoSignIn: true,
      // M10: confirmation is sent, but sign-in is not blocked until it is clicked — the app shows a
      // "Kinnita e-post" banner instead (docs/17). Locking people out over a slow or filtered email
      // would cost more than an unconfirmed address: nothing in Käpp is sent to it except our own mail.
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      // `url` opens the API, which checks the token and redirects to the app (kapp://new-password?token=…).
      sendResetPassword: async ({ user: u, url, token }) => {
        await mailer.sendPasswordReset({ userId: u.id, to: u.email, name: u.name, language: languageOf(u), url, token });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      expiresIn: 24 * 60 * 60,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user: u, token }) => {
        // Our own link instead of `url`: the callback is always our public "confirmed" page, whatever
        // the client asked for, so the email works when opened on a computer as well.
        const callback = encodeURIComponent(`${config.publicUrl}${EMAIL_VERIFIED_PATH}?lang=${languageOf(u)}`);
        const url = `${config.publicUrl}${AUTH_BASE_PATH}/verify-email?token=${encodeURIComponent(token)}&callbackURL=${callback}`;
        await mailer.sendEmailVerification({ userId: u.id, to: u.email, name: u.name, language: languageOf(u), url, token });
      },
    },

    socialProviders,

    user: {
      // Columns exist in db/schema.ts. `input: false` — only the validated PATCH /api/v1/me may set them.
      additionalFields: {
        area: { type: 'string', required: false, input: false },
        bio: { type: 'string', required: false, input: false },
        presenceSharing: { type: 'string', required: false, defaultValue: 'friends', input: false },
        // M10: sign-up may send the app language (emails are written in it) and the legal versions
        // the user accepted on the sign-up screen; both are checked in the create hook below.
        language: { type: 'string', required: false, defaultValue: DEFAULT_LANGUAGE, input: true },
        termsVersion: { type: 'string', required: false, input: true },
        privacyVersion: { type: 'string', required: false, input: true },
        legalAcceptedAt: { type: 'date', required: false, input: false },
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days: a phone app should not log people out weekly
      updateAge: 60 * 60 * 24, // rotate the expiry at most once a day
    },

    // Profile changes go through PATCH /api/v1/me, which validates with the shared schema.
    // M10: account deletion is DELETE /api/v1/me (one transaction with our cleanup), and resending
    // the confirmation is POST /api/v1/me/email-verification (signed in, rate limited) — the public
    // endpoint would let anyone make Käpp email any address.
    disabledPaths: ['/update-user', '/delete-user', '/send-verification-email'],

    rateLimit: { enabled: config.rateLimit, window: 60, max: 100 },

    trustedOrigins: [
      `${config.appScheme}://`,
      'https://appleid.apple.com',
      // Expo Go during development uses exp:// URLs.
      ...(config.isProduction ? [] : ['exp://', 'exp://**']),
    ],

    advanced: {
      cookiePrefix: 'kapp',
      useSecureCookies: config.isProduction,
    },

    databaseHooks: {
      user: {
        create: {
          // Server-side guard for the name, which Better Auth itself does not length-check.
          // Email and password are already validated by Better Auth with the same limits.
          before: async (data) => {
            const name = signUpInputSchema.shape.name.safeParse(data.name);
            if (!name.success) {
              // English for Better Auth's logs; the proxy translates the code (auth-errors.ts).
              throw new APIError('BAD_REQUEST', { message: 'Name must be 2–60 characters', code: 'INVALID_NAME' });
            }
            // Unknown language → Estonian (also guards the CHECK constraint).
            const language = isLanguage(data.language) ? data.language : DEFAULT_LANGUAGE;
            // Accepted versions are recorded only if they are the current ones; an old build sending
            // stale versions gets a clear error instead of consent to texts it did not show.
            const { termsVersion, privacyVersion } = data as { termsVersion?: unknown; privacyVersion?: unknown };
            if (termsVersion === undefined && privacyVersion === undefined) {
              // Social sign-up: nothing accepted yet, the app asks right after sign-in.
              return { data: { ...data, name: name.data, language, termsVersion: null, privacyVersion: null, legalAcceptedAt: null } };
            }
            if (termsVersion !== LEGAL_VERSIONS.terms || privacyVersion !== LEGAL_VERSIONS.privacy) {
              throw new APIError('BAD_REQUEST', { message: 'Accepted legal versions are not the current ones', code: 'LEGAL_VERSION_OUTDATED' });
            }
            return { data: { ...data, name: name.data, language, termsVersion, privacyVersion, legalAcceptedAt: new Date() } };
          },
        },
      },
    },

    plugins: [expo()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
