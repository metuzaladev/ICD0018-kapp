import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ListRowProps = {
  title: string;
  subtitle?: string | null;
  /** Shown left of the text (avatar, icon). */
  leading?: ReactNode;
  /** Draws the subtitle in the danger colour (e.g. an overdue vaccination). */
  alert?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityHint?: string;
};

/** Figma "List Row": title, optional subtitle and chevron; at least 64 pt high (HIG ≥ 44 pt target). */
export function ListRow({ title, subtitle, leading, alert = false, onPress, onLongPress, accessibilityHint }: ListRowProps) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.8 : 1 }]}>
      {leading}
      <View style={styles.text}>
        <ThemedText type="label">{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="caption" themeColor={alert ? 'danger' : 'muted'}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="heading" themeColor="muted" accessibilityElementsHidden>
        ›
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius[16],
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 2 },
});
