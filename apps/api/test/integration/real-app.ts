/**
 * The production composition (real Better Auth, repositories and services) for integration
 * tests, mirroring src/index.ts but with a test mailer and Better Auth's rate limiter off.
 */
import { buildApp, defaultAppConfig } from '../../src/app';
import { env } from '../../src/config/env';
import { db } from '../../src/db/client';
import { createAuth } from '../../src/modules/auth/auth';
import type { Mailer } from '../../src/modules/auth/mailer';
import { createSessionResolver } from '../../src/modules/auth/session-resolver';
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
}

export async function buildRealApp(mailer: Mailer = { sendPasswordReset: async () => {} }, options: RealAppOptions = {}) {
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
      ...createServices(db, testStorage, 5000, { realtime: options.realtime, pushQueue: options.pushQueue, bookingReminders: options.bookingReminders }),
      realtime: options.realtime,
      checkDatabase: async () => true,
      resolveUserId: createSessionResolver(auth),
      authHandler: auth.handler,
    },
    defaultAppConfig,
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
