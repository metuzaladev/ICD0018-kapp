import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

type Option<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  options: readonly [Option<T>, Option<T>];
  /** `null` = nothing chosen yet (e.g. a dog's sex is optional). */
  value: T | null;
  onChange: (value: T | null) => void;
  /** Tapping the chosen segment clears the choice (optional fields). Off for view switches. */
  allowDeselect?: boolean;
  /** Read as the group name by VoiceOver ("Sugu"). */
  accessibilityLabel?: string;
};

/**
 * Figma "Segmented Control" (56:105): two equal segments in a surface pill, the chosen one filled
 * with the brand colour. Used for two-way switches (Tulevased / Varasemad, Isane / Emane).
 *
 * Segments share the width equally (as in Figma) but have no fixed height: the label wraps and the
 * control grows with Dynamic Type, so long Russian labels are never clipped. Each segment is a
 * radio inside a radiogroup, ≥ 44 pt high.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, allowDeselect = false, accessibilityLabel }: SegmentedControlProps<T>) {
  const c = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.container, { backgroundColor: c.surface, borderColor: c.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            onPress={() => {
              if (selected && !allowDeselect) return;
              haptic('selection');
              onChange(selected ? null : option.value);
            }}
            style={[styles.segment, selected && { backgroundColor: c.brand }]}>
            <ThemedText type="label" style={[styles.label, { color: selected ? c.onBrand : c.muted }]}>
              {option.label}
            </ThemedText>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: Spacing.one, padding: Spacing.one, borderRadius: Radius.full, borderWidth: 1 },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
  },
  label: { textAlign: 'center' },
});
