import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { Durations, staggerDelay } from '@/lib/motion';

type EnteringProps = {
  children: ReactNode;
  /** Position in a list: rows fade in one after another (capped, see lib/motion.ts). */
  index?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Content that appears when its data arrives: fades in and rises 12 pt, like iOS lists settling.
 * Runs once on mount (Reanimated layout animation), so refetches do not replay it. With Reduce
 * Motion the content is rendered in place without any animation.
 */
export function Entering({ children, index = 0, style }: EnteringProps) {
  const reduceMotion = useReduceMotion();
  if (reduceMotion) return <View style={style}>{children}</View>;
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.duration(Durations.standard)
        .delay(staggerDelay(index))
        .withInitialValues({ transform: [{ translateY: 12 }] })
        .reduceMotion(ReduceMotion.System)}>
      {children}
    </Animated.View>
  );
}
