import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { FormError } from '@/components/form-error';
import { ChipRow, IconChip } from '@/components/icon-chip';
import { OfflineBanner } from '@/components/offline-banner';
import { ParkCard } from '@/components/park-card';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { useFavoriteParks, useNearbyParks } from '@/hooks/use-parks';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { errorMessage } from '@/lib/api';
import { DEFAULT_FILTERS, setParkFilters, useParkFilters } from '@/state/park-filters';

/** "Lähedal" shows only parks within walking distance (same rule as before M9). */
const NEAR_RADIUS_KM = 2;

/**
 * Figma 02 / Explore / Park List (10:227): "Pargid sinu ümber" with Park Cards and filter chips
 * Lähedal / Aktiivsed / Lemmikud (toggles, combinable). Reached from the map's list button and Home.
 * The list is also the accessible alternative to browsing pins on the map.
 */
export default function ParkListScreen() {
  const { t } = useTranslation();
  const location = useDeviceLocation();
  const filters = useParkFilters();
  const nearby = useNearbyParks(location.origin, filters);
  const favorites = useFavoriteParks();
  const refresh = usePullToRefresh(nearby.refetch, favorites.refetch);
  const { data: parks = [], error, isPending } = nearby;
  const [activeOnly, setActiveOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const nearOnly = filters.radiusKm === NEAR_RADIUS_KM;

  const shown = useMemo(() => {
    const favoriteIds = new Set((favorites.data ?? []).map((p) => p.id));
    return parks.filter((p) => (!activeOnly || (p.activeDogs ?? 0) > 0) && (!favoritesOnly || favoriteIds.has(p.id)));
  }, [parks, favorites.data, activeOnly, favoritesOnly]);

  return (
    <Screen underHeader title={t('map.listTitle')} subtitle={t('map.count', { count: shown.length })} refresh={refresh}>
      <OfflineBanner />
      <ChipRow>
        <IconChip
          icon="navigation"
          label={t('map.near')}
          selected={nearOnly}
          onPress={() => setParkFilters({ ...filters, radiusKm: nearOnly ? DEFAULT_FILTERS.radiusKm : NEAR_RADIUS_KM })}
        />
        <IconChip icon="dog" label={t('map.active')} selected={activeOnly} onPress={() => setActiveOnly((v) => !v)} />
        <IconChip icon="heart" label={t('map.favorites')} selected={favoritesOnly} onPress={() => setFavoritesOnly((v) => !v)} />
      </ChipRow>
      {location.usingFallback ? (
        <ThemedText type="caption" themeColor="muted">
          {t('map.fallbackNote')}
        </ThemedText>
      ) : null}

      {error && parks.length > 0 ? <FormError message={errorMessage(error)} /> : null}
      {error && parks.length === 0 ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void nearby.refetch()} retrying={nearby.isFetching} />
      ) : null}
      {isPending && !error ? <SkeletonList rows={3} rowHeight={240} /> : null}
      {!isPending && !error && shown.length === 0 ? (
        <EmptyState
          title={t('map.empty')}
          actionLabel={t('map.emptyAction')}
          onAction={() => {
            setActiveOnly(false);
            setFavoritesOnly(false);
            setParkFilters(DEFAULT_FILTERS);
          }}
        />
      ) : null}
      {shown.map((park, i) => (
        <Entering key={park.id} index={i}>
          <ParkCard park={park} />
        </Entering>
      ))}
    </Screen>
  );
}
