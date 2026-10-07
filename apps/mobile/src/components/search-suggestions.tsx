import type { SearchResult } from '@kapp/shared';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatKm } from '@/lib/format';
import { searchResultIcon } from '@/lib/map-search';

type Props = {
  results: SearchResult[] | undefined;
  loading: boolean;
  /** False when the address service did not answer: the list says addresses are missing. */
  addressesAvailable: boolean;
  /** The request failed (offline, server error): one line instead of an empty list. */
  failed: boolean;
  onSelect: (result: SearchResult) => void;
  maxHeight: number;
};

/**
 * Suggestions under the Kaart search field (docs/19): the app's places first, then Estonian
 * addresses, each with an icon, the place's area and the distance. Tapping one moves the map there.
 * Taps work while the keyboard is open (keyboardShouldPersistTaps), so one tap chooses.
 */
export function SearchSuggestions({ results, loading, addressesAvailable, failed, onSelect, maxHeight }: Props) {
  const c = useTheme();
  const { t } = useTranslation();
  const list = results ?? [];
  const firstAddress = list.findIndex((r) => r.kind === 'address');

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, maxHeight }]} accessibilityLabel={t('map.search.suggestions')}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" bounces={false}>
        {list.map((result, index) => (
          <View key={`${result.kind}-${result.id ?? `${result.lat},${result.lng}`}-${index}`}>
            {index === firstAddress ? (
              <ThemedText type="micro" themeColor="muted" style={styles.section} accessibilityRole="header">
                {t('map.search.addresses')}
              </ThemedText>
            ) : null}
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={[result.name, result.subtitle, result.distanceKm !== null ? formatKm(result.distanceKm) : null].filter(Boolean).join(', ')}
              accessibilityHint={t('map.search.selectHint')}
              onPress={() => onSelect(result)}
              style={[styles.row, index > 0 && index !== firstAddress && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <View style={[styles.iconTile, { backgroundColor: c.soft }]}>
                <Icon name={searchResultIcon(result)} size={18} color={c.accent} />
              </View>
              <View style={styles.text}>
                <ThemedText type="label" numberOfLines={1}>
                  {result.name}
                </ThemedText>
                {result.subtitle ? (
                  <ThemedText type="caption" themeColor="muted" numberOfLines={1}>
                    {result.subtitle}
                  </ThemedText>
                ) : null}
              </View>
              {result.distanceKm !== null ? (
                <ThemedText type="caption" themeColor="muted">
                  {formatKm(result.distanceKm)}
                </ThemedText>
              ) : null}
            </PressableScale>
          </View>
        ))}
        {loading && list.length === 0 ? (
          <View style={styles.status}>
            <ActivityIndicator color={c.muted} />
            <ThemedText type="caption" themeColor="muted">
              {t('map.search.loading')}
            </ThemedText>
          </View>
        ) : null}
        {!loading && !failed && list.length === 0 ? (
          <ThemedText type="caption" themeColor="muted" style={styles.status}>
            {t('map.search.empty')}
          </ThemedText>
        ) : null}
        {failed ? (
          <ThemedText type="caption" themeColor="muted" style={styles.status}>
            {t('map.search.failed')}
          </ThemedText>
        ) : null}
        {!failed && !addressesAvailable ? (
          <ThemedText type="caption" themeColor="muted" style={styles.status}>
            {t('map.search.addressesUnavailable')}
          </ThemedText>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius[16],
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  section: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.one, textTransform: 'uppercase', letterSpacing: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.three, paddingVertical: 10, minHeight: 56 },
  iconTile: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
});
