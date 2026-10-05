import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { PRESS_SCALE, PRESS_SPRING } from '@/lib/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  /** A static style: the press feedback (scale + opacity) is animated on top of it. */
  style?: StyleProp<ViewStyle>;
  /** Draw a disabled control at 60 % opacity (default). Off for rows that are simply not tappable. */
  dimWhenDisabled?: boolean;
};

/**
 * The pressable surface behind every button, chip and list row: it shrinks slightly and dims
 * while pressed (HIG: immediate, subtle feedback). With Reduce Motion only the dimming remains —
 * an opacity change is not motion.
 *
 * Accessibility props are passed through untouched; callers must set role and label (checked by
 * `npm run a11y:check`).
 */
export function PressableScale({ style, onPressIn, onPressOut, disabled, dimWhenDisabled = true, ...rest }: PressableScaleProps) {
  const reduceMotion = useReduceMotion();
  const pressed = useSharedValue(0);
  // Opacity lives here, not in `style`: the animated style would override a static opacity.
  const base = disabled && dimWhenDisabled ? 0.6 : 1;
  const animated = useAnimatedStyle(() => ({
    opacity: base * (1 - pressed.get() * 0.2),
    transform: [{ scale: reduceMotion ? 1 : 1 - pressed.get() * (1 - PRESS_SCALE) }],
  }));
  const animateTo = (value: number) => {
    pressed.set(reduceMotion ? value : withSpring(value, { ...PRESS_SPRING, reduceMotion: ReduceMotion.System }));
  };

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={(e) => {
        animateTo(1);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animateTo(0);
        onPressOut?.(e);
      }}
      style={[style, animated]}
      {...rest}
    />
  );
}
