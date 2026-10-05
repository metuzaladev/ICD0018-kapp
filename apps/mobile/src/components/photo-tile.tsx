import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { photoSource } from '@/hooks/use-photos';
import { useTheme } from '@/hooks/use-theme';

type PhotoTileProps = {
  /** Signed thumbnail URL (M4 dog profile photo), a bundled image (require id, sample illustrations only) or null. */
  uri?: string | number | null;
  /** Shown as the initial when there is no photo; omitted → a paw placeholder. */
  name?: string | null;
  /** Figma: 44 (list rows), 26 (park card faces), 48/56 (map pins). */
  size?: number;
  /** Figma radius: 14 for 44, 8 for 26, 15/18 for pins. Defaults to ~32 % of the size. */
  radius?: number;
  /** Border (map pins: 3 pt brand, park card faces: 2 pt surface). */
  border?: { width: number; color: string };
  style?: StyleProp<ViewStyle>;
};

/**
 * Rounded-square photo of a dog (or person), the M9 replacement for round avatars and row icons
 * (Figma List Row photo, Park Card faces, Map Pin / Dog). Without a photo: the initial on the soft
 * accent colour, or a paw when there is no name (e.g. a dog on the map whose details are private).
 *
 * Decorative: the name is always next to it or in the parent's label.
 */
export function PhotoTile({ uri, name, size = 44, radius, border, style }: PhotoTileProps) {
  const c = useTheme();
  const r = radius ?? Math.round(size * 0.32);
  const frame = [
    { width: size, height: size, borderRadius: r, backgroundColor: c.soft },
    border && { borderWidth: border.width, borderColor: border.color },
    styles.frame,
    style,
  ];
  const initial = name?.trim().charAt(0).toLocaleUpperCase();
  return (
    <View style={frame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {uri ? (
        <Image source={typeof uri === 'number' ? uri : photoSource(uri)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessible={false} />
      ) : initial ? (
        <ThemedText type={size >= 40 ? 'heading' : 'micro'} style={{ color: c.accent }}>
          {initial}
        </ThemedText>
      ) : (
        <Icon name="paw-print" size={Math.round(size * 0.45)} color={c.brand} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
