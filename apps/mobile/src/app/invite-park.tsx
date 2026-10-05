import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
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
  const { data: nearby = [] } = useNearbyParks(location.origin, useParkFilters());
  const { data: favorites = [] } = useFavoriteParks();
  const favoriteIds = new Set(favorites.map((p) => p.id));
  const parks = [...favorites, ...nearby.filter((p) => !favoriteIds.has(p.id))];

  return (
    <Screen underHeader title={t('invite.title', { name: name ?? '' })} subtitle={t('invite.subtitle')}>
      {parks.length === 0 ? <ThemedText themeColor="muted">{t('common.loading')}</ThemedText> : null}
      {parks.map((park) => (
        <ListRow
          key={park.id}
          title={park.name}
          subtitle={favoriteIds.has(park.id) ? t('invite.favorite') : formatKm(park.distanceKm)}
          onPress={() =>
            router.push({ pathname: '/plan-visit', params: { parkId: park.id, parkName: park.name, inviteUserId: userId, inviteName: name ?? '' } })
          }
        />
      ))}
    </Screen>
  );
}
