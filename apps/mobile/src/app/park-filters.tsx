import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatKm } from '@/lib/format';
import { DEFAULT_FILTERS, setParkFilters, useParkFilters, type ParkFilters } from '@/state/park-filters';

const DISTANCES = [1, 5, 10] as const;

const FEATURES = ['smallDogArea', 'water', 'lighting', 'fenced'] as const;

/**
 * Figma 02 / Explore / Filters, presented as a modal. Edits a local draft and applies it on
 * "Näita parke", so the map behind does not refetch on every toggle.
 * (The Figma "Koerte suurus" chips need dog-size data on parks — not in the model yet.)
 */
export default function ParkFiltersScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const applied = useParkFilters();
  const [draft, setDraft] = useState<ParkFilters>(applied);

  return (
    <Screen underHeader title={t('filters.title')} subtitle={t('filters.subtitle')}>
      <ThemedText type="heading">{t('filters.features')}</ThemedText>
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }]}>
        {FEATURES.map((key, index) => (
          <View key={key} style={[styles.row, index > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <ThemedText type="label" style={styles.rowLabel}>
              {t(`filters.${key}`)}
            </ThemedText>
            <Switch
              accessibilityLabel={t(`filters.${key}`)}
              value={Boolean(draft[key])}
              onValueChange={(on) => setDraft((d) => ({ ...d, [key]: on || undefined }))}
              trackColor={{ true: c.brand }}
            />
          </View>
        ))}
      </View>

      <ThemedText type="heading">{t('filters.distance')}</ThemedText>
      <View style={styles.chips}>
        {DISTANCES.map((km) => (
          <Chip key={km} label={formatKm(km)!} selected={draft.radiusKm === km} onPress={() => setDraft((d) => ({ ...d, radiusKm: km }))} />
        ))}
      </View>

      <Button
        label={t('filters.apply')}
        onPress={() => {
          setParkFilters(draft);
          router.back();
        }}
      />
      <Button label={t('filters.clear')} variant="tertiary" onPress={() => setDraft(DEFAULT_FILTERS)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, gap: Spacing.three },
  rowLabel: { flex: 1 },
  chips: { flexDirection: 'row', gap: Spacing.two },
});
