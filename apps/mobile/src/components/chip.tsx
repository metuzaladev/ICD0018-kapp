import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { PressableScale } from '@/components/pressable-scale';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { Durations, motionDuration } from '@/lib/motion';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** Read by VoiceOver after the label when the chip's effect is not obvious (e.g. opens a screen). */
  accessibilityHint?: string;
};

/**
 * Figma "Chip" (Selected = True | False). At least 44 pt high for the HIG touch target.
 *
 * Width comes from the label (flexGrow, no fixed or equal width): Russian labels are up to twice
 * as long, and a row of chips should wrap (`flexWrap` on the parent) rather than break a word.
 * Selecting cross-fades the colours (instant with Reduce Motion) and plays the selection haptic.
 */
export function Chip({ label, selected = false, onPress, accessibilityHint }: ChipProps) {
  const c = useTheme();
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    progress.set(withTiming(selected ? 1 : 0, { duration: motionDuration(Durations.quick, reduceMotion) }));
  }, [selected, reduceMotion, progress]);

  const background = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [c.surface, c.brand]),
  }));
  const text = useAnimatedStyle(() => ({
    color: interpolateColor(progress.get(), [0, 1], [c.text, c.onBrand]),
  }));

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected }}
      onPress={() => {
        haptic('selection');
        onPress();
      }}
      style={styles.chip}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.fill, { borderColor: c.border }, background]} />
      {/* Same Dynamic Type cap as ThemedText (1.6). */}
      <Animated.Text maxFontSizeMultiplier={1.6} style={[Type.caption, styles.label, text]}>
        {label}
      </Animated.Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexGrow: 1,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { borderRadius: Radius.full, borderWidth: StyleSheet.hairlineWidth },
  label: { textAlign: 'center' },
});
