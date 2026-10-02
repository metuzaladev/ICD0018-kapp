import type { Park } from '@kapp/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PhotoTile } from '@/components/photo-tile';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useFriendsInPark } from '@/hooks/use-friends-in-park';
import { useFavoriteParks, useToggleFavorite } from '@/hooks/use-parks';
import { useTheme } from '@/hooks/use-theme';
import { currentLocaleTag } from '@/i18n';
import { dogsLabel, formatKm, formatRating, friendsInParkLabel } from '@/lib/format';
import { haptic } from '@/lib/haptics';

const FEATURES = ['fenced', 'water', 'smallDogArea', 'lighting'] as const;
/** The tag stays one short line on the photo ("Aiaga · vesi"); the park page lists every feature. */
const MAX_TAG_FEATURES = 2;
const MAX_FACES = 3;

/** "Aiaga · vesi": the first feature as written, the rest lower-cased as in the Figma tag. */
export function useFeatureTag(park: Pick<Park, (typeof FEATURES)[number]>): string | null {
  const { t } = useTranslation();
  const labels = FEATURES.filter((key) => park[key])
    .slice(0, MAX_TAG_FEATURES)
    .map((key, i) => {
      const label = t(`parkCard.tag.${key}`);
      return i === 0 ? label : label.toLocaleLowerCase(currentLocaleTag());
    });
  return labels.length > 0 ? labels.join(' · ') : null;
}

type ParkCardProps = {
  park: Park;
  /** Only the park detail API has ratings; lists pass nothing and the ★ is hidden. */
  rating?: number | null;
};

/**
 * Figma "Park Card" (4:39): photo with a feature tag (map.park fill, trees icon) and a favourite
 * heart, name with ★ rating, "1,2 km · 6 koera praegu", and friends in the park (up to three
 * rounded-square faces + "3 sõpra pargis"). Parts without data are hidden, never faked.
 *
 * Two VoiceOver elements: the card (opens the park) and the heart (its own button) — the heart is a
 * sibling laid over the photo, not nested inside the card's pressable.
 */
export function ParkCard({ park, rating }: ParkCardProps) {
  const c = useTheme();
  const { t } = useTranslation();
  const tag = useFeatureTag(park);
  const dogs = park.activeDogs ?? 0;
  // No dogs → nobody can be there; skip the visitors request.
  const friends = useFriendsInPark(park.id, dogs > 0);
  const favorites = useFavoriteParks();
  const toggle = useToggleFavorite(park.id);
  const savedFavorite = Boolean(favorites.data?.some((p) => p.id === park.id));
  // Optimistic: show the requested state while the request runs (rolls back by refetch on error).
  const isFavorite = toggle.isPending && toggle.variables !== undefined ? toggle.variables : savedFavorite;

  const presence = dogs > 0 ? t('parkRow.dogsNow', { dogs: dogsLabel(dogs) }) : t('parkRow.quiet');
  const subtitle = [formatKm(park.distanceKm), presence].filter(Boolean).join(' · ');
  const friendsText = friends.length > 0 ? friendsInParkLabel(friends.length) : null;
  const ratingText = rating != null ? formatRating(rating) : null;
  const label = [park.name, ratingText && t('parkCard.ratingA11y', { rating: ratingText }), subtitle, tag, friendsText]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('parkRow.hint')}
        onPress={() => router.push({ pathname: '/parks/[parkId]', params: { parkId: park.id } })}
        style={styles.content}>
        <View style={styles.photo}>
          {/* Parks have no photos in the API yet: the same licensed placeholder as the park page (docs/05). */}
          <Image source={require('@/assets/images/park-placeholder.jpg')} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
          {tag ? (
            <View style={[styles.tag, { backgroundColor: c.mapPark }]}>
              <Icon name="trees" size={14} color={c.mapPinInk} />
              <ThemedText type="caption" style={{ color: c.mapPinInk }} numberOfLines={1}>
                {tag}
              </ThemedText>
            </View>
          ) : null}
        </View>
        <View style={styles.titleRow}>
          <ThemedText type="heading" style={styles.title}>
            {park.name}
          </ThemedText>
          {ratingText ? (
            <View style={styles.rating}>
              <Icon name="star" size={14} color={c.accent} />
              <ThemedText type="caption">{ratingText}</ThemedText>
            </View>
          ) : null}
        </View>
        <ThemedText type="caption" themeColor="muted">
          {subtitle}
        </ThemedText>
        {friendsText ? (
          <View style={styles.friends}>
            <View style={styles.faces}>
              {friends.slice(0, MAX_FACES).map((f, i) => (
                // Visitors' dog photos are not in the API (only names): the dog's initial stands in.
                <PhotoTile
                  key={f.checkInId}
                  name={f.dogs[0]?.name ?? f.ownerFirstName}
                  size={26}
                  radius={8}
                  border={{ width: 2, color: c.surface }}
                  style={i > 0 && styles.faceOverlap}
                />
              ))}
            </View>
            <ThemedText type="caption" style={{ color: c.accent }}>
              {friendsText}
            </ThemedText>
          </View>
        ) : null}
      </PressableScale>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={isFavorite ? t('park.favoriteRemove') : t('park.favoriteAdd')}
        accessibilityState={{ selected: isFavorite }}
        disabled={toggle.isPending}
        dimWhenDisabled={false}
        hitSlop={5}
        onPress={() => {
          haptic('selection');
          toggle.mutate(!isFavorite);
        }}
        style={[styles.heart, { backgroundColor: c.surface }]}>
        <Icon name={isFavorite ? 'heart-filled' : 'heart'} size={18} color={isFavorite ? c.brand : c.text} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius[16], borderWidth: 1 },
  content: { padding: 12, gap: Spacing.two },
  photo: { height: 140, borderRadius: 12, overflow: 'hidden' },
  tag: {
    position: 'absolute',
    top: 10,
    left: 10,
    // Leaves room for the heart on the right, so a long Russian tag truncates instead of overlapping it.
    maxWidth: '75%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: Spacing.two,
    paddingRight: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  friends: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  faces: { flexDirection: 'row' },
  faceOverlap: { marginLeft: -8 },
  // 34 pt circle as in Figma; hitSlop 5 makes the touch target 44 pt (HIG).
  heart: {
    position: 'absolute',
    top: 22,
    right: 22,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
