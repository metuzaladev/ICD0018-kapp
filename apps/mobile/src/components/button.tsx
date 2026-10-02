import { ActivityIndicator, StyleSheet, View, type PressableProps } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'tertiary';

type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: Variant;
  /** Shows a spinner and blocks presses — prevents double submits while a request runs. */
  loading?: boolean;
  /** Figma "Button / Arrow": an icon after the label (decorative, e.g. arrow-right on "Alustame"). */
  trailingIcon?: IconName;
};

/**
 * Figma component "Button" (Style = Primary | Secondary | Tertiary). At least 52 pt high
 * (≥ 44 pt target) and grows with Dynamic Type: minHeight, never a fixed height, and the label
 * wraps instead of being clipped ("Отправить" must fit at 160 % text size).
 */
export function Button({ label, variant = 'primary', loading = false, disabled, trailingIcon, ...rest }: ButtonProps) {
  const c = useTheme();
  const background = variant === 'primary' ? c.brand : variant === 'secondary' ? c.soft : 'transparent';
  const color = variant === 'primary' ? c.onBrand : variant === 'tertiary' ? c.link : c.text;
  const inactive = disabled || loading;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(inactive), busy: loading }}
      disabled={inactive}
      style={[styles.base, { backgroundColor: background }]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <View style={styles.content}>
          <ThemedText type="label" style={[styles.label, { color }]}>
            {label}
          </ThemedText>
          {trailingIcon ? <Icon name={trailingIcon} size={20} color={color} /> : null}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: Radius[16],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, flexShrink: 1 },
  label: { textAlign: 'center', flexShrink: 1 },
});
