import { useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { Durations, motionDuration } from '@/lib/motion';

type IconChipProps = {
  icon: IconName;
  label: string;
  selected?: boolean;
  onPress: () => void;
  accessibilityHint?: string;
  /** `radio` inside an `accessibilityRole="radiogroup"` (exactly one choice), otherwise a toggle button. */
  role?: 'button' | 'radio';
};

/**
 * Figma "Chip / Icon" (56:134): 18 pt icon + label in a pill. Selected = brand fill and onBrand text,
 * unselected = surface with a hairline border.
 *
 * Figma draws it 40 pt high; the pressable keeps the 44 pt HIG target with 2 pt of invisible
 * padding above and below, so rows still look like the design. Width comes from the label (no fixed
 * width — Russian labels are long); the row scrolls instead of wrapping (ChipRow).
 */
export function IconChip({ icon, label, selected = false, onPress, accessibilityHint, role = 'button' }: IconChipProps) {
  const c = useTheme();
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    progress.set(withTiming(selected ? 1 : 0, { duration: motionDuration(Durations.quick, reduceMotion) }));
  }, [selected, reduceMotion, progress]);

  const fill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [c.surface, c.brand]),
    borderColor: interpolateColor(progress.get(), [0, 1], [c.border, c.brand]),
  }));
  const text = useAnimatedStyle(() => ({ color: interpolateColor(progress.get(), [0, 1], [c.text, c.onBrand]) }));

  return (
    <PressableScale
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={role === 'radio' ? { checked: selected } : { selected }}
      onPress={() => {
        haptic('selection');
        onPress();
      }}
      style={styles.target}>
      <Animated.View style={[styles.pill, fill]}>
        {/* The icon is not animated: it swaps colour with the selection, a 150 ms cross-fade is invisible on 18 pt. */}
        <Icon name={icon} size={18} color={selected ? c.onBrand : c.text} />
        <Animated.Text maxFontSizeMultiplier={1.6} numberOfLines={1} style={[Type.label, text]}>
          {label}
        </Animated.Text>
      </Animated.View>
    </PressableScale>
  );
}

/**
 * A horizontally scrolling row of chips (Figma Chip Row over the map, list filters). Never wraps:
 * the design keeps one line, and long labels scroll into view. Bleeds to the screen edges so the
 * first chip lines up with the content and the last one is not clipped by the margin.
 */
export function ChipRow({
  children,
  radiogroup = false,
  bleed = Spacing.screen,
  style,
}: {
  children: ReactNode;
  /** Set when the chips are an exclusive choice (`role="radio"` chips). */
  radiogroup?: boolean;
  /** Horizontal margin of the parent to bleed through (0 when the parent has none). */
  bleed?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[{ marginHorizontal: -bleed, flexGrow: 0 }, style]}
      contentContainerStyle={[styles.row, { paddingHorizontal: bleed }]}>
      <View style={styles.row} accessibilityRole={radiogroup ? 'radiogroup' : undefined}>
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  target: { minHeight: 44, justifyContent: 'center' },
  pill: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
