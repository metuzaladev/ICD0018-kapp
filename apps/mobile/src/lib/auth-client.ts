import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

import i18n, { currentLanguage } from '@/i18n';

import { API_ORIGIN, APP_SCHEME } from './config';
import { confirmsAccount, onboarding } from './onboarding';

/**
 * Better Auth client. The session cookie lives in the iOS Keychain / Android Keystore via
 * expo-secure-store — never in AsyncStorage, which is unencrypted.
 * `basePath` matches AUTH_BASE_PATH on the API (/api/v1/auth).
 */
export const authClient = createAuthClient({
  baseURL: API_ORIGIN,
  basePath: '/api/v1/auth',
  fetchOptions: {
    // Read per request (not once at start-up) so a language change applies immediately.
    onRequest: (context) => {
      context.headers.set('accept-language', currentLanguage());
      return context;
    },
    // A server-confirmed account on this device: it no longer needs the intro after signing out.
    onSuccess: (context) => {
      if (confirmsAccount(context.data)) void onboarding.markSeen();
    },
  },
  plugins: [
    expoClient({
      scheme: APP_SCHEME,
      storagePrefix: APP_SCHEME,
      cookiePrefix: APP_SCHEME,
      storage: SecureStore,
    }),
  ],
});

/**
 * Better Auth client calls return `{ data, error }`. Our API rewrites every auth error to
 * `{ error: true, message }` in the Accept-Language we send, so `error.message` is already user-facing.
 */
export function authErrorMessage(error: { message?: string } | null | undefined): string | null {
  if (!error) return null;
  return error.message || i18n.t('errors.generic');
}
