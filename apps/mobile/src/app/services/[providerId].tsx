import type { Service } from '@kapp/shared';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ErrorState } from '@/components/error-state';
import { OfflineBanner } from '@/components/offline-banner';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useProvider } from '@/hooks/use-services';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { formatDuration, formatRating, priceLabel, reviewsLabel } from '@/lib/format';
import { haptic } from '@/lib/haptics';

/** One service as a radio row: "Pesu ja kammimine / 60 min · alates 35 €". */
function ServiceOption({ service, selected, onPress }: { service: Service; selected: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  const meta = t('provider.serviceMeta', { duration: formatDuration(service.durationMinutes), price: priceLabel(service.priceCents, service.priceIsFrom) });
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={[service.name, meta, service.description].filter(Boolean).join(', ')}
      accessibilityHint={t('provider.serviceHint')}
      onPress={() => {
        haptic('selection');
        onPress();
      }}
      style={[styles.option, { backgroundColor: selected ? c.soft : c.surface, borderColor: selected ? c.brand : c.border }]}>
      <View style={styles.flex}>
        <ThemedText type="label">{service.name}</ThemedText>
        <ThemedText type="caption" themeColor="muted">
          {meta}
        </ThemedText>
        {service.description ? <ThemedText type="caption">{service.description}</ThemedText> : null}
      </View>
      <View style={[styles.radio, { borderColor: selected ? c.brand : c.border }]} accessibilityElementsHidden>
        {selected ? <View style={[styles.radioDot, { backgroundColor: c.brand }]} /> : null}
      </View>
    </PressableScale>
  );
}

/** Figma 06 / Service / Groomer: who they are, what they offer, "Vali sobiv aeg". */
export default function ProviderScreen() {
  const { t } = useTranslation();
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const query = useProvider(providerId);
  const { data: provider, error, isPending } = query;
  // null = not chosen yet; the cheapest (first) service is preselected so one tap books.
  const [chosen, setChosen] = useState<string | null>(null);
  const selectedId = chosen ?? provider?.services[0]?.id ?? null;

  if (!provider) {
    return (
      <Screen underHeader>
        {error ? <ErrorState message={errorMessage(error)} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
        {isPending ? <SkeletonList rows={3} rowHeight={80} /> : null}
      </Screen>
    );
  }

  const rating =
    provider.ratingAverage === null
      ? null
      : `${t('services.rating', { rating: formatRating(provider.ratingAverage) })} · ${reviewsLabel(provider.ratingCount)}`;

  return (
    <Screen underHeader title={provider.name} subtitle={`${t(`services.kindTitle.${provider.category}`)} · ${provider.area}`}>
      <OfflineBanner />
      {provider.photoUrl ? (
        // Decorative: the provider's name and description say who they are.
        <Image source={{ uri: provider.photoUrl }} style={styles.photo} contentFit="cover" accessibilityIgnoresInvertColors accessible={false} />
      ) : null}
      {provider.tagline ? <ThemedText type="heading">{provider.tagline}</ThemedText> : null}
      {provider.description ? <ThemedText>{provider.description}</ThemedText> : null}
      {provider.address || rating ? (
        <ThemedText type="caption" themeColor="muted">
          {[provider.address, rating].filter(Boolean).join(' · ')}
        </ThemedText>
      ) : null}

      {provider.services.length === 0 ? <ThemedText themeColor="muted">{t('provider.noServices')}</ThemedText> : null}
      <View accessibilityRole="radiogroup" style={styles.options}>
        {provider.services.map((service) => (
          <ServiceOption key={service.id} service={service} selected={service.id === selectedId} onPress={() => setChosen(service.id)} />
        ))}
      </View>

      <Button
        label={t('provider.chooseTime')}
        disabled={!selectedId}
        onPress={() => selectedId && router.push({ pathname: '/book', params: { providerId: provider.id, serviceId: selectedId } })}
      />
      <ThemedText type="caption" themeColor="muted">
        {t('services.demoNote')}
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 16 / 9, borderRadius: Radius[16] },
  options: { gap: Spacing.two },
  option: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius[16],
    borderWidth: 1,
  },
  flex: { flex: 1, gap: 2 },
  radio: { width: 24, height: 24, borderRadius: Radius.full, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: Radius.full },
});
