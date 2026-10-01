/**
 * App theme built from the shared Figma tokens (@kapp/shared). Change the accent here to try
 * another Figma "Accent" mode (terracotta | blue | green | violet).
 */

import { radius, semanticColors, space, typography, type AccentName } from '@kapp/shared';
import { Platform } from 'react-native';

export const ACCENT: AccentName = 'terracotta';

function palette(scheme: 'light' | 'dark') {
  const c = semanticColors(scheme, ACCENT);
  return {
    ...c,
    // Aliases used by the Expo template components
    backgroundElement: c.surface,
    backgroundSelected: c.soft,
    textSecondary: c.muted,
  };
}

export const Colors = {
  light: palette('light'),
  dark: palette('dark'),
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** Figma text styles without font families until Manrope / DM Sans are bundled (milestone M1). */
export const Type = Object.fromEntries(
  Object.entries(typography).map(([k, { fontFamily: _family, ...rest }]) => [k, rest]),
) as { [K in keyof typeof typography]: Omit<(typeof typography)[K], 'fontFamily'> };

export const Spacing = {
  half: 2,
  one: space[4],
  two: space[8],
  three: space[16],
  four: space[24],
  five: space[32],
  six: 64,
  screen: space[24],
} as const;

export const Radius = radius;
