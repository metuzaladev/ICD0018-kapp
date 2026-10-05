import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { useFavoriteParks, useNearbyParks } from '@/hooks/use-parks';
import { formatKm } from '@/lib/format';
import { useParkFilters } from '@/state/park-filters';

/**
 * "Kutsu parki" from a friend's profile: pick a park (favourites first, then nearby), then the
 * usual plan-visit modal; after saving it, the plan is sent to the friend as a message.
 */
export default function InviteParkScreen() {
  const { t } = useTranslation();
  const { userId, name } = useLocalSearchParams<{ userId: string; name?: string }>();
  const location = useDeviceLocation();
  const nearbyQuery = useNearbyParks(location.origin, useParkFilters());
  const favoritesQuery = useFavoriteParks();
  const { data: nearby = [] } = nearbyQuery;
  const { data: favorites = [] } = favoritesQuery;
  const loading = nearbyQuery.isPending || favoritesQuery.isPending;
  const favoriteIds = new Set(favorites.map((p) => p.id));
  const parks = [...favorites, ...nearby.filter((p) => !favoriteIds.has(p.id))];

  return (
    <Screen underHeader title={t('invite.title', { name: name ?? '' })} subtitle={t('invite.subtitle')}>
      {/* Previously "Laen…" stayed forever when there were no parks; now loading and empty differ. */}
      {loading && parks.length === 0 ? <SkeletonList /> : null}
      {!loading && parks.length === 0 ? <EmptyState title={t('map.empty')} /> : null}
      {parks.map((park, i) => (
        <Entering key={park.id} index={i}>
          <ListRow
            title={park.name}
            subtitle={favoriteIds.has(park.id) ? t('invite.favorite') : formatKm(park.distanceKm)}
            onPress={() =>
              router.push({ pathname: '/plan-visit', params: { parkId: park.id, parkName: park.name, inviteUserId: userId, inviteName: name ?? '' } })
            }
          />
        </Entering>
      ))}
    </Screen>
  );
}
