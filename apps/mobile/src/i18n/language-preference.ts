import { isLanguage, type Language } from '@kapp/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import i18n, { deviceLanguage } from '@/i18n';

/**
 * The language picker in Settings: "automaatne" follows the device, or a fixed language.
 *
 * Stored in AsyncStorage, not SecureStore: the choice is not secret, Keychain items survive an app
 * reinstall (a stale preference would outlive the app) and SecureStore exists for credentials such
 * as the session cookie. It is per device, not per account, so it also applies on the sign-in screens.
 */
export type LanguagePreference = 'auto' | Language;

const STORAGE_KEY = 'kapp.language';

let preference: LanguagePreference = 'auto';
const listeners = new Set<() => void>();

function apply() {
  const language = preference === 'auto' ? deviceLanguage() : preference;
  if (i18n.language !== language) void i18n.changeLanguage(language);
}

/** Reads the stored choice before the first screen renders; a storage failure means "automatic". */
export async function loadLanguagePreference(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) preference = stored;
  } catch (e) {
    if (__DEV__) console.warn('Could not read the language preference', e);
  }
  apply();
}

export async function setLanguagePreference(next: LanguagePreference): Promise<void> {
  preference = next;
  apply();
  listeners.forEach((l) => l());
  try {
    if (next === 'auto') await AsyncStorage.removeItem(STORAGE_KEY);
    else await AsyncStorage.setItem(STORAGE_KEY, next);
  } catch (e) {
    // The change still applies for this session.
    if (__DEV__) console.warn('Could not save the language preference', e);
  }
}

export function useLanguagePreference(): LanguagePreference {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => preference,
  );
}

/**
 * Android lets the user change the device (or per-app) language without restarting the app, so
 * "automatic" is re-evaluated whenever the app returns to the foreground. iOS restarts the app.
 */
AppState.addEventListener('change', (status) => {
  if (status === 'active' && preference === 'auto') apply();
});
