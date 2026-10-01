import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'tertiary';

/** Figma component "Button" (Style = Primary | Secondary | Tertiary). Height 52 pt, min. 44 pt target. */
export function Button({ label, variant = 'primary', ...rest }: PressableProps & { label: string; variant?: Variant }) {
  const c = useTheme();
  const background = variant === 'primary' ? c.brand : variant === 'secondary' ? c.soft : 'transparent';
  const color = variant === 'primary' ? c.onBrand : variant === 'tertiary' ? c.link : c.text;

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.base, { backgroundColor: background, opacity: pressed ? 0.8 : 1 }]}
      {...rest}>
      <ThemedText type="smallBold" style={{ color }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 52, borderRadius: Radius[16], alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
});
