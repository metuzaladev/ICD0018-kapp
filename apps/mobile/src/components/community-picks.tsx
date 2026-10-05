import type { PlacePost } from '@kapp/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { Icon } from '@/components/icon';
import { PhotoTile } from '@/components/photo-tile';
import { PressableScale } from '@/components/pressable-scale';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PLACE_CATEGORY_COLOR, PLACE_CATEGORY_ICON } from '@/lib/explore';
import { formatKm, formatNumber } from '@/lib/format';
import { setExploreView } from '@/state/explore-view';

/** Opens the Kaart tab on its Avasta half (the tab-local view store, docs/16), without a new screen. */
function openFeed() {
  setExploreView('feed');
  router.navigate('/map');
}

/**
 * M11 Home "Kogukonna soovitused" (docs/18): the three newest approved place posts near the user
 * as compact rows — photo, name, category pill, distance, author's first name, likes — and
 * "Vaata kõiki" to the Avasta feed. Own pending posts are left out here (they show in Avasta with
 * "Ootab kinnitust"). Each row is one VoiceOver button that opens the post.
 */
export function CommunityPicks({ posts, loading, onSuggest }: { posts: PlacePost[]; loading: boolean; onSuggest: () => void }) {
  const c = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.section}>
      <ThemedText type="heading" accessibilityRole="header">
        {t('home.picks.title')}
      </ThemedText>
      {loading ? <SkeletonList rows={3} rowHeight={72} /> : null}
      {!loading && posts.length === 0 ? (
        <EmptyState title={t('home.picks.empty')} body={t('home.picks.emptyBody')} actionLabel={t('home.picks.suggest')} onAction={onSuggest} />
      ) : null}
      {posts.map((post, i) => {
        const category = t(`explore.categories.${post.category}`);
        const meta = [formatKm(post.distanceKm), t('home.picks.by', { name: post.author.firstName })].filter(Boolean).join(' · ');
        const likes = t('explore.post.likes', { count: post.likeCount });
        return (
          <Entering key={post.id} index={i}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={[post.name, category, meta, likes].join(', ')}
              accessibilityHint={t('home.picks.openHint')}
              onPress={() => router.push({ pathname: '/place-posts/[postId]', params: { postId: post.id } })}
              style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
              <PhotoTile uri={post.photos[0]?.thumbnailUrl ?? null} name={post.name} size={56} radius={14} />
              <View style={styles.text}>
                <ThemedText type="label" numberOfLines={2}>
                  {post.name}
                </ThemedText>
                <View style={styles.metaRow}>
                  <View style={[styles.pill, { backgroundColor: c[PLACE_CATEGORY_COLOR[post.category]] }]}>
                    <Icon name={PLACE_CATEGORY_ICON[post.category]} size={12} color={c.mapPinInk} />
                    <ThemedText type="caption" style={{ color: c.mapPinInk }} maxFontSizeMultiplier={1.3}>
                      {category}
                    </ThemedText>
                  </View>
                  <ThemedText type="caption" themeColor="muted" style={styles.flexText}>
                    {meta}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.likes}>
                <Icon name={post.liked ? 'heart-filled' : 'heart'} size={16} color={c.brand} />
                <ThemedText type="caption">{formatNumber(post.likeCount)}</ThemedText>
              </View>
            </PressableScale>
          </Entering>
        );
      })}
      {posts.length > 0 ? <Button label={t('home.picks.seeAll')} variant="tertiary" accessibilityHint={t('explore.communityEntryHint')} onPress={openFeed} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius[16], borderWidth: 1, minHeight: 64 },
  text: { flex: 1, gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  flexText: { flexShrink: 1 },
  likes: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
