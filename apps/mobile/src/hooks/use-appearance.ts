import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

import { createAppearanceStore, type AppearancePreference } from '@/lib/appearance';

/**
 * The app's appearance store (lib/appearance.ts). `Appearance.setColorScheme` overrides the scheme
 * natively, so React Native's `useColorScheme` (and therefore `useTheme`) and the native UI follow it.
 */
export const appearance = createAppearanceStore(AsyncStorage, (scheme) => Appearance.setColorScheme(scheme));

export function useAppearancePreference(): AppearancePreference {
  return useSyncExternalStore(appearance.subscribe, appearance.get);
}
