import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the user turned on Reduce Motion (iOS) / Remove animations (Android).
 *
 * Why not Reanimated's `useReducedMotion`: it reads the setting once at app start and never
 * updates (see its source), so toggling the setting while the app runs would be ignored. This
 * hook follows `reduceMotionChanged` live. Every animated component in the app checks it and
 * renders the end state without motion when it is on (docs/14).
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => mounted && setReduce(value))
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}
