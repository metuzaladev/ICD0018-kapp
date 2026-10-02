import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic layer over app.json (M8, docs/15-pakendamine-ja-levitamine.md). app.json stays the static
 * source of truth — `eas init` and humans edit it — and this file only adds a check that needs the
 * build environment.
 *
 * Why the check: EXPO_PUBLIC_* values are inlined into the JavaScript bundle when it is built. A
 * preview or production build made without EXPO_PUBLIC_API_URL silently falls back to
 * http://localhost:3000 (src/lib/config.ts) and every tester gets an app that cannot reach the
 * server. Failing while EAS evaluates the config is much cheaper than finding out from TestFlight.
 *
 * The helpers live in this file rather than a separate module because the config loader cannot
 * resolve local TypeScript imports on every Node version; Vitest imports the named exports.
 */

/** eas.json build profiles that produce binaries for testers or the stores. */
export const RELEASE_PROFILES = ['preview', 'production'] as const;

interface ReleaseInput {
  /** Set by EAS Build while it evaluates the app config (`EAS_BUILD_PROFILE`). */
  profile: string | undefined;
  apiUrl: string | undefined;
  projectId: string | undefined;
}

/** Hosts a phone outside the developer's machine/LAN can never reach. */
const LOCAL_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

export function isReleaseProfile(profile: string | undefined): boolean {
  return (RELEASE_PROFILES as readonly string[]).includes(profile ?? '');
}

/** Returns problems (English: build logs); always empty for development builds and local runs. */
export function releaseConfigProblems({ profile, apiUrl, projectId }: ReleaseInput): string[] {
  if (!isReleaseProfile(profile)) return [];
  const problems: string[] = [];

  if (!apiUrl) {
    problems.push(`EXPO_PUBLIC_API_URL is not set for the "${profile}" profile (eas env:create --environment ${profile} …)`);
  } else {
    let url: URL | null = null;
    try {
      url = new URL(apiUrl);
    } catch {
      problems.push(`EXPO_PUBLIC_API_URL is not a valid URL: "${apiUrl}"`);
    }
    if (url) {
      // iOS App Transport Security blocks plain http in release builds anyway, and session cookies
      // are Secure in production (docs/07), so http would also break sign-in.
      if (url.protocol !== 'https:') problems.push(`EXPO_PUBLIC_API_URL must use https in "${profile}" builds: "${apiUrl}"`);
      if (LOCAL_HOST.test(url.hostname)) problems.push(`EXPO_PUBLIC_API_URL points to a local address: "${apiUrl}"`);
      if (url.pathname !== '/' || url.search) problems.push(`EXPO_PUBLIC_API_URL must be an origin without a path: "${apiUrl}"`);
    }
  }

  // Push tokens need the EAS project id (src/lib/push.ts); without it pushes silently never arrive.
  if (!projectId) problems.push('expo.extra.eas.projectId is missing in app.json — run `npx eas-cli@latest init` first');

  return problems;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const extra = config.extra as { eas?: { projectId?: string } } | undefined;
  const problems = releaseConfigProblems({
    profile: process.env.EAS_BUILD_PROFILE,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    projectId: extra?.eas?.projectId,
  });
  if (problems.length > 0) {
    throw new Error(`Release build configuration is incomplete:\n- ${problems.join('\n- ')}`);
  }
  return config as ExpoConfig;
};
