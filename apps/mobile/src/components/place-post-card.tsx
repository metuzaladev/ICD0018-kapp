import type { PlacePost } from '@kapp/shared';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PhotoTile } from '@/components/photo-tile';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTogglePostReaction } from '@/hooks/use-explore';
import { photoSource } from '@/hooks/use-photos';
import { useTheme } from '@/hooks/use-theme';
import { AMENITY_ICON, PLACE_CATEGORY_COLOR, PLACE_CATEGORY_ICON } from '@/lib/explore';
import { formatAgo, formatKm, formatNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';

type PlacePostCardProps = {
  post: PlacePost;
  /** Points an approved recommendation earned (server rule table); shown on own approved posts. */
  earnedPoints?: number | null;
  /** Opens the post (feed); omitted on the detail screen itself. */
  onOpen?: () => void;
  onShowOnMap: () => void;
  /** "…": report / block (others' posts) or delete (own). */
  onMore: () => void;
  /** Detail screen: every photo in a horizontal strip and the full text. */
  expanded?: boolean;
};

/** Small status pill: "Ootab kinnitust" (pending) / "Tagasi lükatud" (rejected) / "+15" earned. */
function Pill({ icon, label, tone }: { icon?: 'paw-print' | 'clock' | 'x'; label: string; tone: 'soft' | 'muted' }) {
  const c = useTheme();
  const fg = tone === 'soft' ? c.accent : c.muted;
  return (
    <View style={[styles.pill, { backgroundColor: tone === 'soft' ? c.soft : c.background, borderColor: c.border }]}>
      {icon ? <Icon name={icon} size={14} color={tone === 'soft' ? c.brand : c.muted} /> : null}
      <ThemedText type="caption" style={{ color: fg }}>
        {label}
      </ThemedText>
    </View>
  );
}

/**
 * Figma "Feed / Place Post" (58:152): author, photo with the category pill, place name, location,
 * amenity chips, text and the action row (heart + count, bookmark, "Kaardil").
 *
 * Deviations (docs/11): the author is a rounded-square initial (the post API gives only the first
 * name, no dog photo); there is no comment counter (comments are out of scope in docs/16).
 */
export function PlacePostCard({ post, earnedPoints, onOpen, onShowOnMap, onMore, expanded = false }: PlacePostCardProps) {
  const c = useTheme();
  const { t } = useTranslation();
  const like = useTogglePostReaction('like');
  const save = useTogglePostReaction('save');
  const category = t(`explore.categories.${post.category}`);
  const location = [post.address, formatKm(post.distanceKm)].filter(Boolean).join(' · ');
  const amenities = post.amenities.map((a) => t(`explore.amenities.${a}`));
  const photos = expanded ? post.photos : post.photos.slice(0, 1);
  const categoryPill = (
    <View style={[styles.category, { backgroundColor: c[PLACE_CATEGORY_COLOR[post.category]] }]}>
      <Icon name={PLACE_CATEGORY_ICON[post.category]} size={16} color={c.mapPinInk} />
      <ThemedText type="caption" style={{ color: c.mapPinInk }}>
        {category}
      </ThemedText>
    </View>
  );

  const body = (
    <>
      {photos.length > 0 ? (
        <View>
          {photos.map((photo, i) => (
            <Image
              key={photo.url.split('?')[0]}
              source={photoSource(photo.url)}
              style={[styles.photo, i > 0 && styles.photoGap]}
              contentFit="cover"
              transition={150}
              accessible={false}
            />
          ))}
          <View style={styles.categoryOnPhoto}>{categoryPill}</View>
        </View>
      ) : null}
      <View style={styles.body}>
        {photos.length === 0 ? categoryPill : null}
        <ThemedText type="title">{post.name}</ThemedText>
        {location ? (
          <ThemedText type="caption" themeColor="muted">
            {location}
          </ThemedText>
        ) : null}
        {post.amenities.length > 0 ? (
          <View style={styles.amenities}>
            {post.amenities.map((a, i) => (
              <View key={a} style={[styles.amenity, { backgroundColor: c.background, borderColor: c.border }]}>
                <Icon name={AMENITY_ICON[a]} size={14} color={c.text} />
                <ThemedText type="caption">{amenities[i]}</ThemedText>
              </View>
            ))}
          </View>
        ) : null}
        {post.body ? <ThemedText numberOfLines={expanded ? undefined : 4}>{post.body}</ThemedText> : null}
      </View>
    </>
  );

  const openLabel = [post.name, category, location, amenities.join(', ')].filter(Boolean).join(', ');

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.author}>
        <View accessible style={styles.who} accessibilityLabel={t('explore.post.byline', { name: post.author.firstName, when: formatAgo(post.createdAt) })}>
          <PhotoTile name={post.author.firstName} size={36} radius={12} />
          <View style={styles.whoText}>
            <ThemedText type="label" numberOfLines={1}>
              {post.isMine ? t('explore.post.you') : post.author.firstName}
            </ThemedText>
            <ThemedText type="caption" themeColor="muted" numberOfLines={1}>
              {t('explore.post.meta', { when: formatAgo(post.createdAt) })}
            </ThemedText>
          </View>
        </View>
        {post.status === 'pending' ? <Pill icon="clock" label={t('explore.post.pending')} tone="muted" /> : null}
        {post.status === 'rejected' ? <Pill icon="x" label={t('explore.post.rejected')} tone="muted" /> : null}
        {post.isMine && post.status === 'approved' && earnedPoints ? (
          <View accessible accessibilityLabel={t('explore.post.earned', { count: earnedPoints })}>
            <Pill icon="paw-print" label={t('explore.post.earnedShort', { points: formatNumber(earnedPoints) })} tone="soft" />
          </View>
        ) : null}
        <PressableScale accessibilityRole="button" accessibilityLabel={t('explore.post.more')} onPress={onMore} style={styles.iconTarget} hitSlop={4}>
          <Icon name="ellipsis" size={22} color={c.muted} />
        </PressableScale>
      </View>

      {onOpen ? (
        <PressableScale accessibilityRole="button" accessibilityLabel={openLabel} accessibilityHint={t('explore.post.openHint')} onPress={onOpen}>
          {body}
        </PressableScale>
      ) : (
        body
      )}

      <View style={styles.actions}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={post.liked ? t('explore.post.unlike') : t('explore.post.like')}
          accessibilityValue={{ text: t('explore.post.likes', { count: post.likeCount }) }}
          accessibilityState={{ selected: post.liked }}
          disabled={post.status !== 'approved'}
          onPress={() => {
            haptic('selection');
            like.mutate({ postId: post.id, on: !post.liked });
          }}
          style={styles.action}>
          <Icon name={post.liked ? 'heart-filled' : 'heart'} size={22} color={post.liked ? c.brand : c.text} />
          <ThemedText type="label">{formatNumber(post.likeCount)}</ThemedText>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={post.saved ? t('explore.post.unsave') : t('explore.post.save')}
          accessibilityState={{ selected: post.saved }}
          disabled={post.status !== 'approved'}
          onPress={() => {
            haptic('selection');
            save.mutate({ postId: post.id, on: !post.saved });
          }}
          style={styles.action}>
          <Icon name={post.saved ? 'bookmark-filled' : 'bookmark'} size={22} color={post.saved ? c.brand : c.text} />
        </PressableScale>
        <View style={styles.spacer} />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('explore.post.onMap')}
          accessibilityHint={t('explore.post.onMapHint')}
          onPress={onShowOnMap}
          style={styles.action}>
          <Icon name="map-pin" size={18} color={c.accent} />
          <ThemedText type="label" style={{ color: c.accent }}>
            {t('explore.post.onMap')}
          </ThemedText>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 28, borderWidth: 1, overflow: 'hidden' },
  author: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14, paddingBottom: 12, paddingLeft: Spacing.three, paddingRight: Spacing.two },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  whoText: { flex: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: StyleSheet.hairlineWidth },
  iconTarget: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  // Figma 340 × 230; the ratio keeps it on any width.
  photo: { width: '100%', aspectRatio: 340 / 230 },
  photoGap: { marginTop: 2 },
  categoryOnPhoto: { position: 'absolute', top: 14, left: 14 },
  category: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingLeft: 10, paddingRight: 12, paddingVertical: 6, borderRadius: Radius.full },
  body: { gap: 10, paddingTop: 14, paddingBottom: Spacing.two, paddingHorizontal: Spacing.three },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  amenity: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8, paddingRight: 10, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two, paddingBottom: Spacing.two },
  action: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: Spacing.two },
  spacer: { flex: 1 },
});
