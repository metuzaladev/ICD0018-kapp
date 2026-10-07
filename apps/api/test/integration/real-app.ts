/**
 * The production composition (real Better Auth, repositories and services) for integration
 * tests, mirroring src/index.ts but with a test mailer and Better Auth's rate limiter off.
 */
import { buildApp, defaultAppConfig } from '../../src/app';
import { env } from '../../src/config/env';
import { db } from '../../src/db/client';
import { createAuth } from '../../src/modules/auth/auth';
import type { StorageCleanup } from '../../src/modules/account/storage-cleanup';
import { createAccountAuth, createSessionStartResolver } from '../../src/modules/auth/account-auth';
import { createSessionResolver } from '../../src/modules/auth/session-resolver';
import { noMailer, type Mailer } from '../../src/modules/mail/mailer';
import type { BookingReminders } from '../../src/modules/bookings/booking-reminders';
import type { PushQueue } from '../../src/modules/notifications/push-queue';
import { createSocketGateway, type SocketGateway } from '../../src/realtime/socket-gateway';
import { createServices, createStorageFromEnv } from '../../src/services';

/** The MinIO from docker-compose.yml (or CI), configured through the same env vars as the server. */
export const testStorage = createStorageFromEnv(env);

export interface RealAppOptions {
  realtime?: SocketGateway;
  pushQueue?: Pick<PushQueue, 'enqueue'>;
  bookingReminders?: BookingReminders;
  storageCleanup?: StorageCleanup;
  /** Same as production: Better Auth's own limiter is off in integration tests, ours stays. */
  rateLimitMax?: number;
}

export async function buildRealApp(mailer: Mailer = noMailer, options: RealAppOptions = {}) {
  const auth = createAuth({
    db,
    mailer,
    config: {
      secret: 'integration-test-secret-integration-test-secret',
      publicUrl: 'http://localhost:3000',
      appScheme: 'kapp',
      isProduction: false,
      rateLimit: false,
    },
  });
  return buildApp(
    {
      ...createServices(db, testStorage, 5000, {
        realtime: options.realtime,
        pushQueue: options.pushQueue,
        bookingReminders: options.bookingReminders,
        mailer,
        storageCleanup: options.storageCleanup,
        accountAuth: createAccountAuth(auth),
      }),
      realtime: options.realtime,
      checkDatabase: async () => true,
      resolveUserId: createSessionResolver(auth),
      resolveSessionStart: createSessionStartResolver(auth),
      authHandler: auth.handler,
    },
    { ...defaultAppConfig, ...(options.rateLimitMax ? { rateLimitMax: options.rateLimitMax } : {}) },
  );
}

export { createSocketGateway };

/** Signs up a fresh user through the real auth endpoint and returns the Cookie header value. */
export async function signUpAndGetCookie(app: Awaited<ReturnType<typeof buildRealApp>>, email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-up/email',
    headers: { 'expo-origin': 'kapp://' },
    payload: { name: 'Testija', email, password: 'pikk-parool-123' },
  });
  if (res.statusCode !== 200) throw new Error(`sign-up failed: ${res.statusCode} ${res.body}`);
  const setCookie = res.headers['set-cookie'];
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}
