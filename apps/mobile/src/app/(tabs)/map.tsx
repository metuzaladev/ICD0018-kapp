import type { Park } from '@kapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { FormError } from '@/components/form-error';
import { LocationPrompt } from '@/components/location-prompt';
import { OfflineBanner } from '@/components/offline-banner';
import { ParkMap } from '@/components/park-map';
import { ParkRow } from '@/components/park-row';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { useNearbyParks } from '@/hooks/use-parks';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { errorMessage } from '@/lib/api';
import { activeFilterCount, DEFAULT_FILTERS, setParkFilters, useParkFilters } from '@/state/park-filters';

/** "Lähedal" shows only parks within walking distance. */
const NEAR_RADIUS_KM = 2;

/** Figma 02 / Explore / Map + Park List: map with markers, selected park, list below. */
export default function MapScreen() {
  const { t } = useTranslation();
  const location = useDeviceLocation();
  const filters = useParkFilters();
  const nearby = useNearbyParks(location.origin, filters);
  const { data: parks = [], error, isPending } = nearby;
  const refresh = usePullToRefresh(nearby.refetch);
  const [selected, setSelected] = useState<Park | null>(null);

  const nearOnly = filters.radiusKm === NEAR_RADIUS_KM;
  const featureCount = activeFilterCount(filters);

  return (
    <Screen title={t('map.title')} subtitle={t('map.subtitle')} refresh={refresh}>
      <OfflineBanner />
      <LocationPrompt status={location.status} canAskAgain={location.canAskAgain} onRequest={location.requestPermission} />

      <View style={styles.chips}>
        <Chip label={t('map.all')} selected={!nearOnly} onPress={() => setParkFilters({ ...filters, radiusKm: 5 })} />
        <Chip label={t('map.near')} selected={nearOnly} onPress={() => setParkFilters({ ...filters, radiusKm: NEAR_RADIUS_KM })} />
        <Chip
          label={featureCount > 0 ? t('map.filtersCount', { count: featureCount }) : t('map.filters')}
          selected={featureCount > 0}
          accessibilityHint={t('map.filtersHint')}
          onPress={() => router.push('/park-filters')}
        />
      </View>

      <ParkMap
        parks={parks}
        center={location.origin}
        showUserLocation={!location.usingFallback}
        selectedId={selected?.id}
        onSelect={setSelected}
      />

      {/* Keep showing cached parks when a refresh fails (offline); only report the error. */}
      {error && parks.length > 0 ? <FormError message={errorMessage(error)} /> : null}
      {error && parks.length === 0 ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void nearby.refetch()} retrying={nearby.isFetching} />
      ) : null}
      {isPending && !error ? <SkeletonList /> : null}
      {!isPending && parks.length === 0 && !error ? (
        <EmptyState
          title={t('map.empty')}
          actionLabel={featureCount > 0 || nearOnly ? t('map.emptyAction') : undefined}
          onAction={() => setParkFilters(DEFAULT_FILTERS)}
        />
      ) : null}

      {parks.length > 0 ? (
        <View style={styles.listHeader}>
          <ThemedText type="heading">{t('map.listTitle')}</ThemedText>
          <ThemedText type="caption" themeColor="muted">
            {t('map.count', { count: parks.length })}
            {location.usingFallback ? ` ${t('map.fallbackNote')}` : ''}
          </ThemedText>
        </View>
      ) : null}

      {selected ? <ParkRow park={selected} highlighted /> : null}
      {parks
        .filter((p) => p.id !== selected?.id)
        .map((park, i) => (
          <Entering key={park.id} index={i}>
            <ParkRow park={park} />
          </Entering>
        ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Wraps instead of squeezing: "Фильтры (2)" and "Рядом" are longer than the Estonian labels.
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  listHeader: { gap: 2 },
});
