import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/components/error-state';
import { InfoCard } from '@/components/info-card';
import { OfflineBanner } from '@/components/offline-banner';
import { PlacePostCard } from '@/components/place-post-card';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { usePlacePost } from '@/hooks/use-explore';
import { usePlacePostActions } from '@/hooks/use-place-post-actions';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useRewards } from '@/hooks/use-rewards';
import { errorMessage } from '@/lib/api';
import { pointsFor } from '@/lib/rewards';

/**
 * A single recommendation (map pin of kind `post`, a notification "Sinu soovitus on avaldatud", or a
 * feed card): the Place Post card with every photo and the full text. Not in Figma as its own frame.
 */
export default function PlacePostScreen() {
  const { t } = useTranslation();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const query = usePlacePost(postId);
  const earned = pointsFor(useRewards().data, 'place_post');
  const actions = usePlacePostActions();
  const refresh = usePullToRefresh(query.refetch);
  const post = query.data;

  return (
    <Screen underHeader refresh={refresh}>
      <OfflineBanner />
      {query.error && !post ? <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
      {query.isPending ? <SkeletonList rows={1} rowHeight={480} /> : null}
      {post ? (
        <>
          <PlacePostCard
            post={post}
            earnedPoints={earned}
            expanded
            onShowOnMap={() => actions.showOnMap(post)}
            onMore={() => actions.openMenu(post, () => router.back())}
          />
          {post.isMine && post.status === 'pending' ? (
            <InfoCard
              title={t('explore.pendingInfoTitle')}
              body={earned ? t('explore.pendingInfoBody', { count: earned }) : t('explore.pendingInfoBodyNoPoints')}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
