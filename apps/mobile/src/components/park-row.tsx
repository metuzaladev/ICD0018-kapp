import type { Park } from '@kapp/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dogsLabel, formatKm } from '@/lib/format';

/** Figma "List Row" for a park: "1,2 km · 6 koera praegu" or "8,2 km · hetkel vaikne"; opens the park detail. */
export function ParkRow({ park, highlighted = false }: { park: Park; highlighted?: boolean }) {
  const c = useTheme();
  const { t } = useTranslation();
  const dogs = park.activeDogs ?? 0;
  const presence = dogs > 0 ? t('parkRow.dogsNow', { dogs: dogsLabel(dogs) }) : t('parkRow.quiet');
  const meta = [formatKm(park.distanceKm), presence].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${park.name}, ${meta}`}
      onPress={() => router.push({ pathname: '/parks/[parkId]', params: { parkId: park.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: c.surface, borderColor: highlighted ? c.brand : c.border, opacity: pressed ? 0.8 : 1 },
      ]}>
      <View style={styles.text}>
        <ThemedText type="label">{park.name}</ThemedText>
        <ThemedText type="caption" themeColor="muted">
          {meta}
        </ThemedText>
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
