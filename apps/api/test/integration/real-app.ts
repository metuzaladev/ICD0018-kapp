/**
 * The production composition (real Better Auth, repositories and services) for integration
 * tests, mirroring src/index.ts but with a test mailer and Better Auth's rate limiter off.
 */
import { buildApp, defaultAppConfig } from '../../src/app';
import { db } from '../../src/db/client';
import { createAuth } from '../../src/modules/auth/auth';
import type { Mailer } from '../../src/modules/auth/mailer';
import { createSessionResolver } from '../../src/modules/auth/session-resolver';
import { createFavoritesRepository } from '../../src/modules/favorites/favorites.repository';
import { createFavoritesService } from '../../src/modules/favorites/favorites.service';
import { createParksRepository } from '../../src/modules/parks/parks.repository';
import { createParksService } from '../../src/modules/parks/parks.service';
import { createProfileRepository } from '../../src/modules/profile/profile.repository';
import { createProfileService } from '../../src/modules/profile/profile.service';

export async function buildRealApp(mailer: Mailer = { sendPasswordReset: async () => {} }) {
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
  const parksRepository = createParksRepository(db);
  return buildApp(
    {
      parksService: createParksService({ repository: parksRepository, timeoutMs: 5000 }),
      profileService: createProfileService({ repository: createProfileRepository(db), timeoutMs: 5000 }),
      favoritesService: createFavoritesService({ favorites: createFavoritesRepository(db), parks: parksRepository, timeoutMs: 5000 }),
      checkDatabase: async () => true,
      resolveUserId: createSessionResolver(auth),
      authHandler: auth.handler,
    },
    defaultAppConfig,
  );
}

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
