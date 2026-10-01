import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'tertiary';

type ButtonProps = PressableProps & {
  label: string;
  variant?: Variant;
  /** Shows a spinner and blocks presses — prevents double submits while a request runs. */
  loading?: boolean;
};

/** Figma component "Button" (Style = Primary | Secondary | Tertiary). 52 pt high, ≥ 44 pt target. */
export function Button({ label, variant = 'primary', loading = false, disabled, ...rest }: ButtonProps) {
  const c = useTheme();
  const background = variant === 'primary' ? c.brand : variant === 'secondary' ? c.soft : 'transparent';
  const color = variant === 'primary' ? c.onBrand : variant === 'tertiary' ? c.link : c.text;
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background, opacity: inactive ? 0.6 : pressed ? 0.8 : 1 },
      ]}
      {...rest}>
      {loading ? <ActivityIndicator color={color} /> : <ThemedText type="label" style={{ color }}>{label}</ThemedText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 52, borderRadius: Radius[16], alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
});
