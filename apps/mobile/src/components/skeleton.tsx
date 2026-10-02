import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Radius, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { SKELETON_OPACITY } from '@/lib/motion';

type SkeletonListProps = {
  /** How many placeholder rows; roughly what fits above the fold. */
  rows?: number;
  /** Height of one row, matching the real row it stands in for (ListRow is 64 pt). */
  rowHeight?: number;
};

/**
 * Loading placeholder for a list (replaces the old "Laen…" text): grey rows shaped like the
 * content, so the layout does not jump when data arrives. The rows pulse gently; with Reduce
 * Motion they stay still. VoiceOver hears one element, "Laen…", instead of empty boxes.
 */
export function SkeletonList({ rows = 3, rowHeight = 64 }: SkeletonListProps) {
  const { t } = useTranslation();
  const c = useTheme();
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue<number>(SKELETON_OPACITY.to);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(opacity);
      opacity.set(SKELETON_OPACITY.to);
      return;
    }
    opacity.set(SKELETON_OPACITY.to);
    opacity.set(withRepeat(withTiming(SKELETON_OPACITY.from, { duration: 800 }), -1, true));
    return () => cancelAnimation(opacity);
  }, [reduceMotion, opacity]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      accessibilityState={{ busy: true }}
      style={styles.list}>
      {Array.from({ length: rows }, (_, i) => (
        <Animated.View key={i} style={[styles.row, { height: rowHeight, backgroundColor: c.surface, borderColor: c.border }, pulse]}>
          <View style={[styles.line, styles.title, { backgroundColor: c.soft }]} />
          <View style={[styles.line, styles.subtitle, { backgroundColor: c.soft }]} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.three },
  row: {
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius[16],
    borderWidth: StyleSheet.hairlineWidth,
  },
  line: { height: 12, borderRadius: Radius.full },
  title: { width: '55%' },
  subtitle: { width: '35%' },
});
