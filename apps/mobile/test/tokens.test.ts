import { accents, mapPalette, semanticColors, type AccentName } from '@kapp/shared';
import { describe, expect, it } from 'vitest';

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const ACCENTS = Object.keys(accents) as AccentName[];

/**
 * The M9 token model (docs/05): every accent carries `onBase` (text on the brand fill) and `ink`
 * (the accent as text on light surfaces). These checks keep text readable (≥ 4.5 : 1, docs/05)
 * for every accent, including the bright lime where white text would fail.
 */
describe('design tokens', () => {
  it.each(ACCENTS)('%s: text on the brand fill is readable', (name) => {
    const light = semanticColors('light', name);
    expect(contrast(light.onBrand, light.brand)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ACCENTS)('%s: link/accent text is readable on light and dark surfaces', (name) => {
    for (const scheme of ['light', 'dark'] as const) {
      const c = semanticColors(scheme, name);
      expect(c.link).toBe(c.accent);
      expect(contrast(c.accent, c.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.accent, c.background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('lime needs dark text on its base and a darker ink', () => {
    expect(semanticColors('light', 'lime').onBrand).toBe('#10150A');
    expect(semanticColors('light', 'lime').link).toBe('#4F7A00');
  });

  it('the four darker accents keep white on brand and ink = base', () => {
    for (const name of ['terracotta', 'blue', 'green', 'violet'] as const) {
      expect(accents[name].onBase).toBe('#FFFFFF');
      expect(accents[name].ink).toBe(accents[name].base);
    }
  });

  it('map colours follow the scheme and pin icons stay distinguishable (≥ 3 : 1, non-text)', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const c = semanticColors(scheme, 'green');
      for (const fill of [c.mapPark, c.mapCafe, c.mapBeach, c.mapService, c.mapVet]) {
        expect(contrast(c.mapPinInk, fill)).toBeGreaterThanOrEqual(3);
      }
    }
    expect(semanticColors('light').mapPark).toBe(mapPalette.park.light);
    expect(semanticColors('dark').mapPark).toBe(mapPalette.park.dark);
  });
});
