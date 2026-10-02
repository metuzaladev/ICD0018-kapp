import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * "Has this device seen the intro?" (Figma Onboarding / Discover + Connect, shown once).
 *
 * AsyncStorage, not SecureStore: the flag is not secret, and a Keychain item would survive an app
 * reinstall, so a fresh install would wrongly skip the intro (same reasoning as the language
 * preference in docs/11). Per device, not per account.
 *
 * A tiny module store (like state/park-filters.ts) because the root layout reads it before the
 * first screen and the onboarding screen writes it; no library is needed for one boolean.
 */
export const ONBOARDING_STORAGE_KEY = 'kapp.onboardingSeen';
const SEEN = '1';

/** The part of AsyncStorage the store needs; injected so tests can simulate failures. */
export type FlagStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export type OnboardingStore = {
  /** Reads the stored flag once; resolves to whether the intro was already seen. Never rejects. */
  load(): Promise<boolean>;
  /** Marks the intro as seen for this session immediately and persists it best-effort. */
  markSeen(): Promise<void>;
  /** `null` until `load()` has finished. */
  isSeen(): boolean | null;
  subscribe(listener: () => void): () => void;
};

export function createOnboardingStore(storage: FlagStorage): OnboardingStore {
  let seen: boolean | null = null;
  const listeners = new Set<() => void>();
  const set = (next: boolean) => {
    seen = next;
    listeners.forEach((l) => l());
  };

  return {
    async load() {
      try {
        const stored = await storage.getItem(ONBOARDING_STORAGE_KEY);
        set(stored === SEEN);
      } catch {
        // Unreadable storage: treat as seen. The intro is optional, and showing it on every launch
        // (storage that keeps failing) would be worse than skipping it once.
        set(true);
      }
      return seen === true;
    },
    async markSeen() {
      set(true);
      try {
        await storage.setItem(ONBOARDING_STORAGE_KEY, SEEN);
      } catch {
        // Still applies for this session; at worst the intro shows once more after a restart.
      }
    },
    isSeen: () => seen,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const onboarding = createOnboardingStore(AsyncStorage);

/** `null` while loading, then whether the intro was seen; re-renders when it is marked seen. */
export function useOnboardingSeen(): boolean | null {
  return useSyncExternalStore(onboarding.subscribe, onboarding.isSeen);
}
