import { StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, ZoomIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { Durations, POP_SPRING } from '@/lib/motion';

const SIZE = 64;

/**
 * The "it worked" moment (booking confirmed, check-in): a brand-coloured check that pops in with
 * one soft overshoot. Decorative — the screen title says the same in words — so it is hidden from
 * VoiceOver. Static with Reduce Motion. The caller plays the success haptic.
 */
export function SuccessMark() {
  const c = useTheme();
  const reduceMotion = useReduceMotion();
  const content = (
    <ThemedText type="hero" style={{ color: c.onBrand }}>
      ✓
    </ThemedText>
  );
  const style = [styles.mark, { backgroundColor: c.brand }];

  if (reduceMotion) {
    return (
      <View style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {content}
      </View>
    );
  }
  return (
    <Animated.View
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      entering={ZoomIn.springify()
        .damping(POP_SPRING.damping)
        .stiffness(POP_SPRING.stiffness)
        .delay(Durations.quick)
        .reduceMotion(ReduceMotion.System)}>
      {content}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  mark: { width: SIZE, height: SIZE, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
});
