import type { Park } from '@kapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { FormError } from '@/components/form-error';
import { LocationPrompt } from '@/components/location-prompt';
import { OfflineBanner } from '@/components/offline-banner';
import { ParkMap } from '@/components/park-map';
import { ParkRow } from '@/components/park-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { useNearbyParks } from '@/hooks/use-parks';
import { errorMessage } from '@/lib/api';
import { activeFilterCount, setParkFilters, useParkFilters } from '@/state/park-filters';

/** "Lähedal" shows only parks within walking distance. */
const NEAR_RADIUS_KM = 2;

/** Figma 02 / Explore / Map + Park List: map with markers, selected park, list below. */
export default function MapScreen() {
  const { t } = useTranslation();
  const location = useDeviceLocation();
  const filters = useParkFilters();
  const { data: parks = [], error, isPending } = useNearbyParks(location.origin, filters);
  const [selected, setSelected] = useState<Park | null>(null);

  const nearOnly = filters.radiusKm === NEAR_RADIUS_KM;
  const featureCount = activeFilterCount(filters);

  return (
    <Screen title={t('map.title')} subtitle={t('map.subtitle')}>
      <OfflineBanner />
      <LocationPrompt status={location.status} canAskAgain={location.canAskAgain} onRequest={location.requestPermission} />

      <View style={styles.chips}>
        <Chip label={t('map.all')} selected={!nearOnly} onPress={() => setParkFilters({ ...filters, radiusKm: 5 })} />
        <Chip label={t('map.near')} selected={nearOnly} onPress={() => setParkFilters({ ...filters, radiusKm: NEAR_RADIUS_KM })} />
        <Chip
          label={featureCount > 0 ? t('map.filtersCount', { count: featureCount }) : t('map.filters')}
          selected={featureCount > 0}
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
      {error ? <FormError message={errorMessage(error)} /> : null}
      {!isPending && parks.length === 0 && !error ? <ThemedText themeColor="muted">{t('map.empty')}</ThemedText> : null}

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
        .map((park) => (
          <ParkRow key={park.id} park={park} />
        ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: Spacing.two },
  listHeader: { gap: 2 },
});
