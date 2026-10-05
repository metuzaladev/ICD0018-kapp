import type { ProviderSummary } from '@kapp/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatKm, formatRating, priceLabel, reviewsLabel } from '@/lib/format';

/**
 * Figma "Services / Discover" provider card: "Käpakoda · koerte hooldus" over
 * "Kadriorg · 1,2 km · alates 35 € · ★ 4,9". Opens the provider screen.
 */
export function ProviderRow({ provider }: { provider: ProviderSummary }) {
  const c = useTheme();
  const { t } = useTranslation();
  const title = t('services.rowTitle', { name: provider.name, kind: t(`services.kind.${provider.category}`) });
  const price = provider.priceFromCents === null ? null : priceLabel(provider.priceFromCents, true);
  const rating = provider.ratingAverage === null ? null : t('services.rating', { rating: formatRating(provider.ratingAverage) });
  const meta = [provider.area, formatKm(provider.distanceKm), price, rating].filter(Boolean).join(' · ');
  // VoiceOver reads the rating in words instead of "star 4,9".
  const ratingA11y =
    provider.ratingAverage === null
      ? null
      : t('services.ratingA11y', { rating: formatRating(provider.ratingAverage), reviews: reviewsLabel(provider.ratingCount) });
  const a11yLabel = [title, provider.area, formatKm(provider.distanceKm), price, ratingA11y].filter(Boolean).join(', ');

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={() => router.push({ pathname: '/services/[providerId]', params: { providerId: provider.id } })}
      style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.text}>
        <ThemedText type="label">{title}</ThemedText>
        {provider.tagline ? <ThemedText type="caption">{provider.tagline}</ThemedText> : null}
        <ThemedText type="caption" themeColor="muted">
          {meta}
        </ThemedText>
      </View>
      <ThemedText type="heading" themeColor="muted" accessibilityElementsHidden>
        ›
      </ThemedText>
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
