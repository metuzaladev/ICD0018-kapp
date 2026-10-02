/**
 * Settings → "Välimus": follow the system, or always light / always dark.
 *
 * Default is **light**: the M9 Figma redesign ("03 · Screens") is drawn in light mode, and the
 * dark palette is the secondary theme. A user who prefers dark (or "follow the system") picks it once.
 *
 * Same storage reasoning as the language preference (docs/11): AsyncStorage, not SecureStore — the
 * choice is not secret, and a Keychain item would outlive an app reinstall. Per device.
 *
 * This module is pure (no react-native import) so it is unit-tested in Node; `hooks/use-appearance.ts`
 * creates the app's instance with AsyncStorage and React Native's `Appearance.setColorScheme`.
 */
export const APPEARANCE_PREFERENCES = ['system', 'light', 'dark'] as const;
export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number];

export const APPEARANCE_STORAGE_KEY = 'kapp.appearance';
export const DEFAULT_APPEARANCE: AppearancePreference = 'light';

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return typeof value === 'string' && (APPEARANCE_PREFERENCES as readonly string[]).includes(value);
}

/**
 * The value handed to `Appearance.setColorScheme`: 'unspecified' gives control back to the system.
 * Overriding natively (instead of only in our palette) keeps native UI — tab bar, headers, alerts,
 * keyboard, the Apple button — in the same scheme as the app.
 */
export function nativeSchemeFor(preference: AppearancePreference): 'light' | 'dark' | 'unspecified' {
  return preference === 'system' ? 'unspecified' : preference;
}

/** The part of AsyncStorage the store needs; injected so tests can simulate failures. */
export type PreferenceStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export type AppearanceStore = {
  /** Reads the stored choice and applies it. Never rejects; failure keeps the default. */
  load(): Promise<AppearancePreference>;
  /** Applies immediately, persists best-effort. */
  set(next: AppearancePreference): Promise<void>;
  get(): AppearancePreference;
  subscribe(listener: () => void): () => void;
};

export function createAppearanceStore(
  storage: PreferenceStorage,
  apply: (scheme: 'light' | 'dark' | 'unspecified') => void,
): AppearanceStore {
  let preference: AppearancePreference = DEFAULT_APPEARANCE;
  const listeners = new Set<() => void>();
  const update = (next: AppearancePreference) => {
    preference = next;
    try {
      apply(nativeSchemeFor(next));
    } catch {
      // A native failure must not break settings; the palette still follows useColorScheme.
    }
    listeners.forEach((l) => l());
  };

  return {
    async load() {
      let stored: string | null = null;
      try {
        stored = await storage.getItem(APPEARANCE_STORAGE_KEY);
      } catch {
        // Unreadable storage: keep the default (light), like the language preference keeps "auto".
      }
      update(isAppearancePreference(stored) ? stored : DEFAULT_APPEARANCE);
      return preference;
    },
    async set(next) {
      update(next);
      try {
        await storage.setItem(APPEARANCE_STORAGE_KEY, next);
      } catch {
        // Still applies for this session.
      }
    },
    get: () => preference,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
