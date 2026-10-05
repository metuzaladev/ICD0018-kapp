import type { Park } from '@kapp/shared';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Distance in Estonian format: "1,2 km". */
export function formatKm(km: number | undefined): string | null {
  return km === undefined ? null : `${km.toLocaleString('et-EE', { maximumFractionDigits: 1 })} km`;
}

/** Figma "List Row" for a park: name, distance and dogs present; opens the park detail. */
export function ParkRow({ park, highlighted = false }: { park: Park; highlighted?: boolean }) {
  const c = useTheme();
  const meta = [formatKm(park.distanceKm), `${park.activeDogs ?? 0} koera praegu`].filter(Boolean).join(' · ');

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
