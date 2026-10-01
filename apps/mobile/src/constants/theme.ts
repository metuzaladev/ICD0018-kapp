/**
 * App theme built from the shared Figma tokens (@kapp/shared). Change the accent here to try
 * another Figma "Accent" mode (terracotta | blue | green | violet).
 */

import { radius, semanticColors, space, typography, type AccentName } from '@kapp/shared';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
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

/** Font files loaded in the root layout. Only these weights ship, to keep the bundle small. */
export const FontAssets = {
  Manrope_700Bold,
  Manrope_800ExtraBold,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
};

/**
 * Figma family + weight → loaded font name. Custom fonts on Android ignore fontWeight (and iOS
 * would fake-bold), so each weight is its own family name instead of a fontWeight value.
 */
const FONT_FILE: Record<string, keyof typeof FontAssets> = {
  'Manrope/700': 'Manrope_700Bold',
  'Manrope/800': 'Manrope_800ExtraBold',
  'DM Sans/400': 'DMSans_400Regular',
  'DM Sans/500': 'DMSans_500Medium',
  'DM Sans/700': 'DMSans_700Bold',
};

type TextToken = { fontFamily: string; fontSize: number; lineHeight: number };

export const Type = Object.fromEntries(
  Object.entries(typography).map(([name, t]) => [
    name,
    { fontFamily: FONT_FILE[`${t.fontFamily}/${t.fontWeight}`], fontSize: t.fontSize, lineHeight: t.lineHeight },
  ]),
) as Record<keyof typeof typography, TextToken>;

export const Fonts = Platform.select({
  ios: { mono: 'ui-monospace' },
  default: { mono: 'monospace' },
});

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
