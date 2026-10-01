/**
 * Runtime configuration from EXPO_PUBLIC_* variables (inlined at build time — never put secrets here).
 * Kept separate from api.ts / auth-client.ts so both can import it without a circular dependency.
 */

/** API origin. On a physical phone set EXPO_PUBLIC_API_URL=http://<computer-ip>:3000 in .env.local. */
export const API_ORIGIN = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/** Must match app.json → expo.scheme and APP_SCHEME on the API (trusted origin for auth). */
export const APP_SCHEME = 'kapp';

/** Social sign-in buttons appear only when the API has the matching credentials configured. */
export const AUTH_APPLE_ENABLED = process.env.EXPO_PUBLIC_AUTH_APPLE === 'true';
export const AUTH_GOOGLE_ENABLED = process.env.EXPO_PUBLIC_AUTH_GOOGLE === 'true';
