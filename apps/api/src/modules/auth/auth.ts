import { expo } from '@better-auth/expo';
import { PASSWORD_MAX, PASSWORD_MIN, signUpInputSchema } from '@kapp/shared';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';

import type { Db } from '../../db/client';
import { account, session, user, verification } from '../../db/schema';
import type { Mailer } from './mailer';

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
      // No email provider yet (M8); verification would lock every new user out.
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user: u, url }) => {
        await mailer.sendPasswordReset({ to: u.email, name: u.name, url });
      },
    },

    socialProviders,

    user: {
      // Columns exist in db/schema.ts. `input: false` — only the validated PATCH /api/v1/me may set them.
      additionalFields: {
        area: { type: 'string', required: false, input: false },
        bio: { type: 'string', required: false, input: false },
        presenceSharing: { type: 'string', required: false, defaultValue: 'friends', input: false },
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days: a phone app should not log people out weekly
      updateAge: 60 * 60 * 24, // rotate the expiry at most once a day
    },

    // Profile changes go through PATCH /api/v1/me, which validates with the shared schema.
    disabledPaths: ['/update-user'],

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
              throw new APIError('BAD_REQUEST', { message: 'Nimi peab olema 2–60 märki', code: 'INVALID_NAME' });
            }
            return { data: { ...data, name: name.data } };
          },
        },
      },
    },

    plugins: [expo()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
