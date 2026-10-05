import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { PhotoTile } from '@/components/photo-tile';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ListRowProps = {
  title: string;
  subtitle?: string | null;
  /**
   * Figma List Row photo variant: a 44 pt rounded-square photo (radius 14) for dogs and people.
   * `uri` null → the initial of `name` as a placeholder.
   */
  photo?: { uri?: string | null; name?: string | null };
  /** Figma List Row icon variant (Lucide, 24 pt) for menu rows. */
  icon?: IconName;
  /** Anything else left of the text. */
  leading?: ReactNode;
  /** Draws the subtitle in the danger colour (e.g. an overdue vaccination). */
  alert?: boolean;
  /** Omitted → an informational row (e.g. "Sina" among park visitors): no chevron, read as text. */
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityHint?: string;
};

/**
 * Figma "List Row" (4:24): optional photo or icon, title, subtitle and chevron; at least 64 pt high
 * (HIG ≥ 44 pt target). One VoiceOver element ("title, subtitle"); photo and chevron are decoration.
 */
export function ListRow({ title, subtitle, photo, icon, leading, alert = false, onPress, onLongPress, accessibilityHint }: ListRowProps) {
  const c = useTheme();
  return (
    <PressableScale
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      disabled={!onPress && !onLongPress}
      dimWhenDisabled={false}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      {photo ? <PhotoTile uri={photo.uri} name={photo.name ?? title} size={44} radius={14} /> : null}
      {icon ? <Icon name={icon} size={24} color={c.text} /> : null}
      {leading}
      <View style={styles.text}>
        <ThemedText type="label">{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="caption" themeColor={alert ? 'danger' : 'muted'}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {onPress ? <Icon name="chevron-right" size={18} color={c.muted} /> : null}
    </PressableScale>
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
