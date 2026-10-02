import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Figma onboarding / permission benefit row: a 44 pt soft icon tile, a bold title and a muted line.
 * One VoiceOver element ("title, body"); the icon is decoration.
 */
export function FeatureRow({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const c = useTheme();
  return (
    <View style={styles.row} accessible accessibilityLabel={`${title}, ${body}`}>
      <View style={[styles.tile, { backgroundColor: c.soft }]}>
        <Icon name={icon} size={22} color={c.brand} />
      </View>
      <View style={styles.text}>
        <ThemedText type="label">{title}</ThemedText>
        <ThemedText type="caption" themeColor="muted">
          {body}
        </ThemedText>
      </View>
    </View>
  );
}

/** Figma "või e-postiga": a hairline with a short caption in the middle. */
export function OrDivider({ label }: { label: string }) {
  const c = useTheme();
  return (
    <View style={styles.divider}>
      <View style={[styles.line, { backgroundColor: c.border }]} />
      <ThemedText type="caption" themeColor="muted">
        {label}
      </ThemedText>
      <View style={[styles.line, { backgroundColor: c.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  tile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
