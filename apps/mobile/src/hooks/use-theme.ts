/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** The palette for the current scheme (system or Settings → Välimus). */
export function useTheme() {
  return Colors[useColorScheme()];
}
