/**
 * Design tokens mirrored from the Figma file
 * "Käpp — Dog Park App · Design System & Screens" (variables: Primitives, Color, Accent, Dimensions;
 * text styles: Typography/*). Keep names in sync with Figma so design and code can be compared 1:1.
 */

export const primitives = {
  white: '#FFFFFF',
  ink: '#14181F',
  gray50: '#F7F8FA',
  gray100: '#F2F4F7',
  gray200: '#E3E6EA',
  gray400: '#A3ACB9',
  gray600: '#5B6472',
  inkDeep: '#0F1419',
  slate900: '#1A2028',
  slate700: '#2A323D',
  red: '#AD4C42',
  rose: '#FAE3DE',
} as const;

/** Figma collection "Accent". The first entry is the default mode. */
export const accents = {
  terracotta: {
    base: '#B5532A',
    light: '#F0A27E',
    soft: '#FBEEE8',
    softDark: '#33241D',
    tint: '#F6DCCF',
    tintDark: '#6B3319',
  },
  blue: {
    base: '#2F6BE0',
    light: '#8DB2FF',
    soft: '#EAF1FE',
    softDark: '#1F2A3D',
    tint: '#D6E4FD',
    tintDark: '#24407A',
  },
  green: {
    base: '#2E7D4F',
    light: '#7FD1A0',
    soft: '#E8F4EC',
    softDark: '#1C2E24',
    tint: '#CFE8D8',
    tintDark: '#1F4A33',
  },
  violet: {
    base: '#6B4EE6',
    light: '#B3A4FF',
    soft: '#EFECFD',
    softDark: '#272340',
    tint: '#DED8FB',
    tintDark: '#3A2E85',
  },
} as const;

export type AccentName = keyof typeof accents;
export type ColorScheme = 'light' | 'dark';

/** Figma collection "Color" (modes Light / Dark), resolved for one accent. */
export function semanticColors(scheme: ColorScheme, accentName: AccentName = 'terracotta') {
  const a = accents[accentName];
  const p = primitives;
  const light = scheme === 'light';
  return {
    background: light ? p.gray50 : p.inkDeep,
    surface: light ? p.white : p.slate900,
    text: light ? p.ink : p.gray100,
    muted: light ? p.gray600 : p.gray400,
    border: light ? p.gray200 : p.slate700,
    brand: a.base,
    onBrand: p.white,
    link: light ? a.base : a.light,
    soft: light ? a.soft : a.softDark,
    tint: light ? a.tint : a.tintDark,
    danger: light ? p.red : p.rose,
    dangerSoft: light ? p.rose : p.red,
  };
}

export type SemanticColors = ReturnType<typeof semanticColors>;

/** Figma text styles Typography/*, aligned to the iOS type scale. */
export const typography = {
  display: { fontFamily: 'Manrope', fontWeight: '800', fontSize: 56, lineHeight: 64 },
  hero: { fontFamily: 'Manrope', fontWeight: '700', fontSize: 34, lineHeight: 41 },
  title: { fontFamily: 'Manrope', fontWeight: '700', fontSize: 22, lineHeight: 28 },
  heading: { fontFamily: 'Manrope', fontWeight: '700', fontSize: 17, lineHeight: 22 },
  body: { fontFamily: 'DM Sans', fontWeight: '400', fontSize: 17, lineHeight: 22 },
  label: { fontFamily: 'DM Sans', fontWeight: '700', fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: 'DM Sans', fontWeight: '500', fontSize: 13, lineHeight: 18 },
  micro: { fontFamily: 'DM Sans', fontWeight: '500', fontSize: 11, lineHeight: 13 },
} as const;

export const space = { 0: 0, 4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32, 40: 40, 48: 48 } as const;
export const radius = { 0: 0, 12: 12, 16: 16, 24: 24, 32: 32, full: 999 } as const;

/** Figma Dimensions → ios/* (Apple Human Interface Guidelines). */
export const ios = {
  touchTargetMin: 44,
  navBarHeight: 44,
  tabBarHeight: 49,
  screenMargin: 24,
} as const;
