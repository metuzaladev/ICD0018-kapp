import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { OfflineBanner } from '@/components/offline-banner';
import { PlacePostCard } from '@/components/place-post-card';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { SkeletonList } from '@/components/skeleton';
import { useMyPlacePosts, useSavedPlacePosts } from '@/hooks/use-explore';
import { usePlacePostActions } from '@/hooks/use-place-post-actions';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useRewards } from '@/hooks/use-rewards';
import { errorMessage } from '@/lib/api';
import { pointsFor } from '@/lib/rewards';

type Tab = 'mine' | 'saved';

/**
 * "Minu soovitused" (Profile): the user's own recommendations with their status (pending, approved
 * with the points earned, rejected) and the bookmarked ones. Not a Figma frame; same cards as Avasta.
 */
export default function MyPlacePostsScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('mine');
  const mine = useMyPlacePosts(tab === 'mine');
  const saved = useSavedPlacePosts(tab === 'saved');
  const list = tab === 'mine' ? mine : saved;
  const posts = list.data?.pages.flatMap((p) => p.items) ?? [];
  const earned = pointsFor(useRewards().data, 'place_post');
  const actions = usePlacePostActions();
  const refresh = usePullToRefresh(list.refetch);

  return (
    <Screen underHeader title={t('explore.mine.title')} subtitle={t('explore.mine.subtitle')} refresh={refresh}>
      <OfflineBanner />
      <SegmentedControl
        accessibilityLabel={t('explore.mine.title')}
        options={[
          { value: 'mine', label: t('explore.mine.tabMine') },
          { value: 'saved', label: t('explore.mine.tabSaved') },
        ]}
        value={tab}
        onChange={(v) => v && setTab(v)}
      />
      {list.error && !list.data ? <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} retrying={list.isFetching} /> : null}
      {list.isPending ? <SkeletonList rows={1} rowHeight={420} /> : null}
      {list.data && posts.length === 0 ? (
        tab === 'mine' ? (
          <EmptyState title={t('explore.mine.emptyMine')} actionLabel={t('explore.suggest')} onAction={() => router.push('/suggest-place')} />
        ) : (
          <EmptyState title={t('explore.mine.emptySaved')} />
        )
      ) : null}
      {posts.map((post, i) => (
        <Entering key={post.id} index={i}>
          <PlacePostCard
            post={post}
            earnedPoints={earned}
            onOpen={() => router.push({ pathname: '/place-posts/[postId]', params: { postId: post.id } })}
            onShowOnMap={() => actions.showOnMap(post)}
            onMore={() => actions.openMenu(post)}
          />
        </Entering>
      ))}
      {list.hasNextPage ? (
        <Button label={t('notifications.more')} variant="secondary" loading={list.isFetchingNextPage} onPress={() => list.fetchNextPage()} />
      ) : null}
    </Screen>
  );
}
