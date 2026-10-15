import { ios, type PlacePost } from '@kapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { ChipRow, IconChip } from '@/components/icon-chip';
import { OfflineBanner } from '@/components/offline-banner';
import { PawBackground } from '@/components/paw-background';
import { PlacePostCard } from '@/components/place-post-card';
import { PressableScale } from '@/components/pressable-scale';
import { SegmentedControl } from '@/components/segmented-control';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { usePlacePostFeed } from '@/hooks/use-explore';
import { usePlacePostActions } from '@/hooks/use-place-post-actions';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useRewards } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { DEFAULT_FEED_FILTERS, FEED_CATEGORY_CHIPS, feedQueryParams, PLACE_CATEGORY_ICON, toggleCategory, type FeedFilters } from '@/lib/explore';
import { pointsFor } from '@/lib/rewards';
import { setExploreView } from '@/state/explore-view';

/** Kept for the session, so leaving for a post and coming back keeps the chosen chips. */
let lastFilters: FeedFilters = DEFAULT_FEED_FILTERS;

/** Kaart / Avasta at the top of both halves of the Kaart tab (state/explore-view.ts). */
function ExploreSwitch() {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      accessibilityLabel={t('explore.switchLabel')}
      options={[
        { value: 'map', label: t('explore.switchMap') },
        { value: 'feed', label: t('explore.switchFeed') },
      ]}
      value="feed"
      onChange={(v) => v && setExploreView(v)}
    />
  );
}

/**
 * Figma 09 / Explore / Avasta (84:7825), the feed half of the Kaart tab: "Koerasõbralikud kohad.",
 * the Kaart / Avasta switch, filter chips (Lähedal, Kohvikud, Pargid, Rannad, Poed, Sõbrad), Place
 * Post cards with infinite paging, and the floating "Soovita kohta" button.
 */
export function ExploreFeed() {
  const { t } = useTranslation();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const location = useDeviceLocation();
  const [filters, setFiltersState] = useState<FeedFilters>(lastFilters);
  const setFilters = (next: FeedFilters) => {
    lastFilters = next;
    setFiltersState(next);
  };
  const feed = usePlacePostFeed(feedQueryParams(filters, location.origin));
  const rewards = useRewards();
  const earned = pointsFor(rewards.data, 'place_post');
  const actions = usePlacePostActions();
  const refresh = usePullToRefresh(feed.refetch);
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const tabBarSpace = insets.bottom + ios.tabBarHeight + Spacing.three;

  const header = (
    <View style={styles.header}>
      <ThemedText type="title" accessibilityRole="header">
        {t('explore.title')}
      </ThemedText>
      <ThemedText themeColor="muted">{t('explore.subtitle')}</ThemedText>
      <ExploreSwitch />
      <ChipRow>
        <IconChip
          icon="navigation"
          label={t('explore.filters.near')}
          accessibilityHint={location.usingFallback ? t('explore.filters.nearFallbackHint') : undefined}
          selected={filters.near}
          onPress={() => setFilters({ ...filters, near: !filters.near })}
        />
        {FEED_CATEGORY_CHIPS.map((category) => (
          <IconChip
            key={category}
            icon={PLACE_CATEGORY_ICON[category]}
            label={t(`explore.filters.${category}`)}
            selected={filters.category === category}
            onPress={() => setFilters(toggleCategory(filters, category))}
          />
        ))}
        <IconChip icon="users" label={t('explore.filters.friends')} selected={filters.friends} onPress={() => setFilters({ ...filters, friends: !filters.friends })} />
      </ChipRow>
      <OfflineBanner />
      {feed.error && feed.data ? <FormError message={errorMessage(feed.error)} /> : null}
      {feed.error && !feed.data ? <ErrorState message={errorMessage(feed.error)} onRetry={() => void feed.refetch()} retrying={feed.isFetching} /> : null}
      {feed.isPending ? <SkeletonList rows={2} rowHeight={420} /> : null}
      {feed.data && posts.length === 0 ? (
        <EmptyState
          title={filters.friends ? t('explore.emptyFriendsTitle') : t('explore.emptyTitle')}
          body={t('explore.emptyBody')}
          actionLabel={t('explore.suggest')}
          onAction={() => router.push('/suggest-place')}
        />
      ) : null}
    </View>
  );

  return (
    <ThemedView style={styles.root}>
      <PawBackground />
      <SafeAreaView edges={['top']} style={styles.root}>
        <FlatList<PlacePost>
          data={posts}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.content, { paddingBottom: tabBarSpace + 52 + Spacing.four }]}
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          renderItem={({ item, index }) => (
            <Entering index={index}>
              <PlacePostCard
                post={item}
                earnedPoints={earned}
                onOpen={() => router.push({ pathname: '/place-posts/[postId]', params: { postId: item.id } })}
                onShowOnMap={() => actions.showOnMap(item)}
                onMore={() => actions.openMenu(item)}
              />
            </Entering>
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
          }}
          ListFooterComponent={feed.isFetchingNextPage ? <SkeletonList rows={1} rowHeight={420} /> : null}
          refreshControl={<RefreshControl refreshing={refresh.refreshing} onRefresh={refresh.onRefresh} tintColor={c.brand} colors={[c.brand]} />}
          contentInsetAdjustmentBehavior="automatic"
        />
      </SafeAreaView>
      {/* Figma floating "Soovita kohta" above the tab bar. */}
      <View style={[styles.fabWrap, { bottom: tabBarSpace }]} pointerEvents="box-none">
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('explore.suggest')}
          accessibilityHint={t('explore.suggestHint')}
          onPress={() => router.push('/suggest-place')}
          style={[styles.fab, { backgroundColor: c.brand }]}>
          <Icon name="plus" size={22} color={c.onBrand} />
          <ThemedText type="label" style={{ color: c.onBrand }}>
            {t('explore.suggest')}
          </ThemedText>
        </PressableScale>
      </View>
    </ThemedView>
  );
}

/** "Kogukonna soovitused" on the map: switches the tab to Avasta. */
export function CommunityEntry() {
  const { t } = useTranslation();
  const c = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t('explore.communityEntry')}
      accessibilityHint={t('explore.communityEntryHint')}
      onPress={() => setExploreView('feed')}
      style={[styles.entry, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Icon name="sparkles" size={20} color={c.brand} />
      <ThemedText type="label" style={styles.entryLabel}>
        {t('explore.communityEntry')}
      </ThemedText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: Spacing.screen, paddingTop: Spacing.three },
  header: { gap: Spacing.three, marginBottom: Spacing.three },
  gap: { height: Spacing.three },
  fabWrap: { position: 'absolute', right: Spacing.screen, left: Spacing.screen, alignItems: 'flex-end' },
  fab: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: 20,
    paddingVertical: Spacing.two,
    borderRadius: Radius[16],
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  entry: {
    flexShrink: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  entryLabel: { flexShrink: 1 },
});
