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

/**
 * Figma collection "Accent". The first entry is Figma's first mode; the app picks one in
 * apps/mobile/src/constants/theme.ts (`ACCENT`, green since the M9 light redesign).
 * `onBase` = text/icons on the brand fill, `ink` = the accent as text on light backgrounds.
 */
export const accents = {
  terracotta: {
    base: '#B5532A',
    light: '#F0A27E',
    soft: '#FBEEE8',
    softDark: '#33241D',
    tint: '#F6DCCF',
    tintDark: '#6B3319',
    onBase: '#FFFFFF',
    ink: '#B5532A',
  },
  blue: {
    base: '#2F6BE0',
    light: '#8DB2FF',
    soft: '#EAF1FE',
    softDark: '#1F2A3D',
    tint: '#D6E4FD',
    tintDark: '#24407A',
    onBase: '#FFFFFF',
    ink: '#2F6BE0',
  },
  green: {
    base: '#2E7D4F',
    light: '#7FD1A0',
    soft: '#E8F4EC',
    softDark: '#1C2E24',
    tint: '#CFE8D8',
    tintDark: '#1F4A33',
    onBase: '#FFFFFF',
    ink: '#2E7D4F',
  },
  violet: {
    base: '#6B4EE6',
    light: '#B3A4FF',
    soft: '#EFECFD',
    softDark: '#272340',
    tint: '#DED8FB',
    tintDark: '#3A2E85',
    onBase: '#FFFFFF',
    ink: '#6B4EE6',
  },
  /**
   * Bright accent: its base is too light for white text or for text on a light background, which
   * is why every accent carries `onBase` (text on the brand fill) and `ink` (the accent used as
   * text on light surfaces). For the four darker accents both are simply white / the base.
   */
  lime: {
    base: '#C9F04A',
    light: '#DFFF7A',
    soft: '#F3FAD9',
    softDark: '#232B12',
    tint: '#E7F6B4',
    tintDark: '#3A4A10',
    onBase: '#10150A',
    ink: '#4F7A00',
  },
} as const;

export type AccentName = keyof typeof accents;

/** Figma variables "map/*" (modes Light / Dark), independent of the accent. */
export const mapPalette = {
  park: { light: '#4F8A5B', dark: '#7FC28E' },
  cafe: { light: '#C8743F', dark: '#F0A27E' },
  beach: { light: '#3E7CB1', dark: '#8EC5F0' },
  service: { light: '#B5532A', dark: '#E07A4F' },
  vet: { light: '#B4564B', dark: '#EE9A90' },
  pinInk: { light: '#FFFFFF', dark: '#0F1419' },
  pinRing: { light: '#FFFFFF', dark: '#F2F4F7' },
} as const;
export type ColorScheme = 'light' | 'dark';

/** Figma collection "Color" (modes Light / Dark), resolved for one accent. */
export function semanticColors(scheme: ColorScheme, accentName: AccentName = 'terracotta') {
  const a = accents[accentName];
  const p = primitives;
  const m = mapPalette;
  const light = scheme === 'light';
  return {
    background: light ? p.gray50 : p.inkDeep,
    surface: light ? p.white : p.slate900,
    text: light ? p.ink : p.gray100,
    muted: light ? p.gray600 : p.gray400,
    border: light ? p.gray200 : p.slate700,
    brand: a.base,
    onBrand: a.onBase,
    link: light ? a.ink : a.light,
    /** Figma color/accent: the accent as readable text (points, "3 sõpra pargis"). */
    accent: light ? a.ink : a.light,
    soft: light ? a.soft : a.softDark,
    tint: light ? a.tint : a.tintDark,
    danger: light ? p.red : p.rose,
    dangerSoft: light ? p.rose : p.red,
    // Figma "map/*": place categories on the map (pins, the park photo tag). Flat keys so every
    // value stays a colour string usable as a ThemeColor.
    mapPark: light ? m.park.light : m.park.dark,
    mapCafe: light ? m.cafe.light : m.cafe.dark,
    mapBeach: light ? m.beach.light : m.beach.dark,
    mapService: light ? m.service.light : m.service.dark,
    mapVet: light ? m.vet.light : m.vet.dark,
    /** Icon/text on a category fill. */
    mapPinInk: light ? m.pinInk.light : m.pinInk.dark,
    /** Ring around a place pin, separates it from the map tiles. */
    mapPinRing: light ? m.pinRing.light : m.pinRing.dark,
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
