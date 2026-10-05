import type { ParkActivity } from '@kapp/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { ListRow } from '@/components/list-row';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { errorMessage } from '@/lib/api';
import { dogsLabel, formatList, plannedVisitsLabel } from '@/lib/format';
import { isQuiet, plannedParts } from '@/lib/home-activity';

type Query = {
  data?: { parks: ParkActivity[] };
  isPending: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => unknown;
};

/**
 * M11 Home "Lemmikparkides täna" (docs/18): for each favourite park (or the two nearest parks when
 * there are none) the dogs there now and today's planned visits by part of day, with friends named
 * ("Õhtul: 4 plaanitud külastust", "Sõbrad: Mari ja Jaan"). Everyone else is only a number, and only
 * people whose presence the user may see are counted at all (API, docs/12 → M11).
 *
 * Each park is one VoiceOver button that opens the park page.
 */
export function ParkActivitySection({ query, source, enabled }: { query: Query; source: 'favorites' | 'nearby'; enabled: boolean }) {
  const { t } = useTranslation();
  const parks = query.data?.parks ?? [];
  const openPark = (parkId: string) => router.push({ pathname: '/parks/[parkId]', params: { parkId } });

  const lines = (park: ParkActivity) => {
    const out = [park.activeDogs > 0 ? t('home.activity.now', { dogs: dogsLabel(park.activeDogs) }) : t('home.activity.nowQuiet')];
    for (const { part, count } of plannedParts(park.planned)) {
      out.push(t('home.activity.planned', { part: t(`home.activity.parts.${part}`), visits: plannedVisitsLabel(count) }));
    }
    if (park.friends.length > 0) out.push(t('home.activity.friends', { names: formatList(park.friends.map((f) => f.firstName)) }));
    else if (isQuiet(park)) out.push(t('home.activity.noPlans'));
    return out.join('\n');
  };

  return (
    <View style={styles.section}>
      <ThemedText type="heading" accessibilityRole="header">
        {source === 'favorites' ? t('home.activity.title') : t('home.activity.titleNearby')}
      </ThemedText>
      {enabled && query.isPending ? <SkeletonList rows={2} rowHeight={88} /> : null}
      {query.error && parks.length === 0 ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : null}
      {parks.map((park, i) => (
        <Entering key={park.id} index={i}>
          <ListRow icon="trees" title={park.name} subtitle={lines(park)} onPress={() => openPark(park.id)} accessibilityHint={t('parkRow.hint')} />
        </Entering>
      ))}
      {source === 'nearby' ? (
        // No favourites yet: the numbers above are for the nearest parks; the useful next step is choosing favourites.
        <EmptyState
          title={t('home.activity.noFavorites')}
          body={t('home.activity.noFavoritesBody')}
          actionLabel={t('home.activity.addFavorite')}
          actionHint={t('home.activity.addFavoriteHint')}
          onAction={() => router.push('/parks')}
        />
      ) : (
        <Button label={t('home.activity.manageFavorites')} variant="tertiary" onPress={() => router.push('/favorites')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
});
