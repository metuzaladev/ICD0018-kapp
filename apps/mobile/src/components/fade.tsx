import { Image } from 'expo-image';
import { StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * A vertical fade into the background colour (Figma: Welcome hero photo fading out, the top of the
 * full-screen map under the status bar). A white→transparent SVG gradient tinted with `tintColor`
 * (alpha is kept), so it matches the background in light and dark mode without expo-linear-gradient
 * (a native module that would need a rebuild).
 *
 * `direction="up"` fades towards the top (transparent at the bottom), `"down"` towards the bottom.
 */
export function Fade({ direction = 'down', style }: { direction?: 'up' | 'down'; style?: StyleProp<ImageStyle> }) {
  const c = useTheme();
  return (
    <Image
      source={require('@/assets/images/fade.svg')}
      tintColor={c.background}
      contentFit="fill"
      style={[styles.fill, direction === 'up' && styles.flip, style]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, right: 0 },
  flip: { transform: [{ scaleY: -1 }] },
});
