import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * Figma component "Background / Paws": 21 paw prints at 9 % opacity in the accent colour,
 * behind every screen. The SVG (assets/images/paw-pattern.svg) is generated from the Figma
 * positions, sizes and rotations; its paws are white so `tintColor` can apply the accent,
 * which keeps it correct for every Figma "Accent" mode and for light/dark.
 *
 * Fixed behind the content (it does not scroll), exactly like the locked Figma layer, and
 * hidden from VoiceOver because it is decoration.
 */
const PATTERN_OPACITY = 0.09;

export function PawBackground() {
  const c = useTheme();
  return (
    <Image
      source={require('@/assets/images/paw-pattern.svg')}
      tintColor={c.brand}
      contentFit="cover"
      contentPosition="top"
      style={[StyleSheet.absoluteFill, { opacity: PATTERN_OPACITY }]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    />
  );
}
