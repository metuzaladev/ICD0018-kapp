import { useColorScheme as useNativeColorScheme } from 'react-native';

/**
 * The resolved scheme ('light' | 'dark') for the whole app. Settings → Välimus overrides the system
 * scheme natively (hooks/use-appearance.ts), so this already reflects the user's choice. Use this
 * hook instead of React Native's directly: one place decides what an unknown scheme means (light,
 * the redesign's default).
 */
export function useColorScheme(): 'light' | 'dark' {
  return useNativeColorScheme() === 'dark' ? 'dark' : 'light';
}
