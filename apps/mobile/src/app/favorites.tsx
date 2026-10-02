import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { OfflineBanner } from '@/components/offline-banner';
import { ParkCard } from '@/components/park-card';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { useFavoriteParks } from '@/hooks/use-parks';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { errorMessage } from '@/lib/api';

/** Figma 05 / Saved / Favorite Parks. */
export default function FavoritesScreen() {
  const { t } = useTranslation();
  const favorites = useFavoriteParks();
  const { data: parks, error, isPending } = favorites;
  const refresh = usePullToRefresh(favorites.refetch);

  return (
    <Screen underHeader title={t('favorites.title')} subtitle={t('favorites.subtitle')} refresh={refresh}>
      <OfflineBanner />
      {error && !parks ? <ErrorState message={errorMessage(error)} onRetry={() => void favorites.refetch()} retrying={favorites.isFetching} /> : null}
      {isPending ? <SkeletonList /> : null}
      {parks?.length === 0 ? <EmptyState title={t('favorites.empty')} /> : null}
      {parks?.map((park, i) => (
        <Entering key={park.id} index={i}>
          <ParkCard park={park} />
        </Entering>
      ))}
      {parks ? <Button label={t('favorites.explore')} variant="secondary" onPress={() => router.navigate('/map')} /> : null}
    </Screen>
  );
}
