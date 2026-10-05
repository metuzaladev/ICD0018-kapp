import { StyleSheet, View } from 'react-native';

/**
 * Figma "Progress / Reward" (58:134): a 10 pt rounded track with a fill. Decorative by default —
 * the caller says the same in words ("Veel 180 käppa…"); pass `label` to make it a VoiceOver
 * progress bar on its own.
 */
export function ProgressBar({
  value,
  track,
  fill,
  height = 10,
  label,
}: {
  /** 0…1 */
  value: number;
  track: string;
  fill: string;
  height?: number;
  label?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * 100);
  return (
    <View
      accessible={Boolean(label)}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      accessibilityRole={label ? 'progressbar' : undefined}
      accessibilityLabel={label}
      accessibilityValue={label ? { min: 0, max: 100, now: pct } : undefined}
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: track }]}>
      <View style={{ width: `${pct}%`, height, borderRadius: height / 2, backgroundColor: fill }} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
});
