import type { ParkDetail } from '@kapp/shared';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { FormError } from '@/components/form-error';
import { OfflineBanner } from '@/components/offline-banner';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useParkDetail, useToggleFavorite } from '@/hooks/use-parks';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useActiveCheckIn, useEndCheckIn, useParkReviews, useParkVisitors } from '@/hooks/use-visits';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { formatKm, formatRating, formatTime, reviewsLabel } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { POP_SPRING } from '@/lib/motion';

const FEATURES = ['fenced', 'smallDogArea', 'water', 'lighting'] as const satisfies readonly (keyof ParkDetail)[];

/** Opens Apple Maps on iOS and the default maps app on Android with walking directions. */
function openDirections(park: ParkDetail) {
  const label = encodeURIComponent(park.name);
  const url =
    Platform.OS === 'ios'
      ? `maps://?daddr=${park.lat},${park.lng}&dirflg=w&q=${label}`
      : `geo:${park.lat},${park.lng}?q=${park.lat},${park.lng}(${label})`;
  Linking.openURL(url);
}

/** The header heart; re-keyed on change so it pops (one spring) when toggled. Static with Reduce Motion. */
function Heart({ filled }: { filled: boolean }) {
  const c = useTheme();
  const reduceMotion = useReduceMotion();
  const glyph = (
    <ThemedText type="hero" style={{ color: c.brand }}>
      {filled ? '♥' : '♡'}
    </ThemedText>
  );
  if (reduceMotion) return glyph;
  return (
    <Animated.View
      key={String(filled)}
      entering={ZoomIn.springify().damping(POP_SPRING.damping).stiffness(POP_SPRING.stiffness).reduceMotion(ReduceMotion.System)}>
      {glyph}
    </Animated.View>
  );
}

/**
 * Figma 02 / Park / Overview, with the Visitors and Reviews tabs as sections of one scroll.
 *
 * Park row → detail transition: the native stack push (iOS slide) carries the spatial link and the
 * photo and title settle in with `Entering`. A Reanimated shared element transition was not used:
 * in Reanimated 4.5 it sits behind the static ENABLE_SHARED_ELEMENT_TRANSITIONS flag (native
 * rebuild, conflicts with IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS) and is still marked experimental;
 * see docs/14-animatsioonid-ja-ligipaasetavus.md.
 */
export default function ParkDetailScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const { parkId } = useLocalSearchParams<{ parkId: string }>();
  const detail = useParkDetail(parkId);
  const { data: park, error, isPending } = detail;
  const favorite = useToggleFavorite(parkId);
  const active = useActiveCheckIn();
  const endVisit = useEndCheckIn();
  const visitors = useParkVisitors(parkId);
  const reviews = useParkReviews(parkId);
  const hereNow = active.data?.park.id === parkId ? active.data : null;
  const parkParams = { parkId, parkName: park?.name ?? '' };
  const refresh = usePullToRefresh(detail.refetch, visitors.refetch, reviews.refetch, active.refetch);

  return (
    <>
      <Stack.Screen
        options={{
          title: park?.name ?? '',
          headerRight: () =>
            park ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={park.isFavorite ? t('park.favoriteRemove') : t('park.favoriteAdd')}
                accessibilityState={{ selected: Boolean(park.isFavorite) }}
                hitSlop={12}
                style={styles.heart}
                disabled={favorite.isPending}
                onPress={() => {
                  haptic('selection');
                  favorite.mutate(!park.isFavorite);
                }}>
                <Heart filled={Boolean(park.isFavorite)} />
              </Pressable>
            ) : null,
        }}
      />
      <Screen underHeader refresh={park ? refresh : undefined}>
        <OfflineBanner />
        {error && !park ? <ErrorState message={errorMessage(error)} onRetry={() => void detail.refetch()} retrying={detail.isFetching} /> : null}
        {favorite.error ? <FormError message={errorMessage(favorite.error)} /> : null}
        {isPending ? <SkeletonList rows={2} rowHeight={120} /> : null}

        {park ? (
          <>
            <Entering>
              <Image
                source={require('@/assets/images/park-placeholder.jpg')}
                style={styles.photo}
                contentFit="cover"
                accessibilityLabel={t('park.photoLabel')}
              />
            </Entering>
            <Entering index={1} style={styles.header}>
              <ThemedText type="title" accessibilityRole="header">
                {park.name}
              </ThemedText>
              {/* Figma: "1,2 km · Kesklinn, Tallinn". */}
              {park.address || park.distanceKm !== undefined ? (
                <ThemedText themeColor="muted">{[formatKm(park.distanceKm), park.address].filter(Boolean).join(' · ')}</ThemedText>
              ) : null}
            </Entering>

            {hereNow ? (
              <ThemedView type="tint" style={styles.summary}>
                <ThemedText type="heading">{t('park.hereUntil', { time: formatTime(hereNow.expiresAt) })}</ThemedText>
                <ThemedText type="caption">{hereNow.dogs.map((d) => d.name).join(', ')}</ThemedText>
                <Button
                  label={t('park.endVisit')}
                  variant="secondary"
                  loading={endVisit.isPending}
                  onPress={() => endVisit.mutate(hereNow.id)}
                />
              </ThemedView>
            ) : null}
            {endVisit.error ? <FormError message={errorMessage(endVisit.error)} /> : null}

            <ThemedView type="soft" style={styles.summary}>
              <ThemedText type="heading">{t('park.dogsNow', { count: park.activeDogs ?? 0 })}</ThemedText>
              <ThemedText type="caption" themeColor="muted">
                {park.reviewCount > 0 && park.ratingAverage !== null
                  ? t('park.rating', { rating: formatRating(park.ratingAverage), reviews: reviewsLabel(park.reviewCount) })
                  : t('park.noReviews')}
              </ThemedText>
            </ThemedView>

            {!hereNow ? (
              <Button label={t('park.checkIn')} onPress={() => router.push({ pathname: '/check-in', params: parkParams })} />
            ) : null}
            <Button label={t('park.plan')} variant="secondary" onPress={() => router.push({ pathname: '/plan-visit', params: parkParams })} />
            <Button label={t('park.directions')} variant="secondary" onPress={() => openDirections(park)} />

            {FEATURES.some((key) => park[key]) || park.description ? (
              <>
                <ThemedText type="heading">{t('park.goodToKnow')}</ThemedText>
                <View style={styles.features}>
                  {FEATURES.filter((key) => park[key]).map((key) => (
                    <View key={key} style={[styles.badge, { borderColor: c.border, backgroundColor: c.surface }]}>
                      <ThemedText type="caption">{t(`park.feature.${key}`)}</ThemedText>
                    </View>
                  ))}
                </View>
                {park.description ? <ThemedText>{park.description}</ThemedText> : null}
              </>
            ) : null}

            {visitors.data && (visitors.data.visitors.length > 0 || visitors.data.hiddenDogs > 0) ? (
              <>
                <ThemedText type="heading">{t('park.visitorsTitle')}</ThemedText>
                {visitors.data.visitors.map((v, i) => {
                  const title = [v.isMe ? t('common.you') : v.ownerFirstName, v.dogs.map((d) => d.name).join(', ')].join(' · ');
                  const details = t('park.visitorDetails', {
                    breeds: v.dogs.map((d) => d.breed).filter(Boolean).join(', ') || t('common.dog'),
                    time: formatTime(v.until),
                  });
                  return (
                    <Entering key={v.checkInId} index={i}>
                      <PressableScale
                        // Figma: "Ava koera profiil ja saada omanikule sõbrakutse" — a visitor opens their profile.
                        disabled={v.isMe}
                        dimWhenDisabled={false}
                        accessibilityRole={v.isMe ? 'text' : 'button'}
                        accessibilityLabel={`${title}, ${details}`}
                        accessibilityHint={v.isMe ? undefined : t('park.visitorHint')}
                        onPress={() => router.push({ pathname: '/users/[userId]', params: { userId: v.userId } })}
                        style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
                        <ThemedText type="label">{title}</ThemedText>
                        <ThemedText type="caption" themeColor="muted">
                          {details}
                        </ThemedText>
                      </PressableScale>
                    </Entering>
                  );
                })}
                {visitors.data.hiddenDogs > 0 ? (
                  <ThemedText type="caption" themeColor="muted">
                    {t('park.hiddenDogs', { count: visitors.data.hiddenDogs })}
                  </ThemedText>
                ) : null}
                <ThemedView type="soft" style={styles.summary}>
                  <ThemedText type="label">{t('park.firstMeetTitle')}</ThemedText>
                  <ThemedText type="caption" themeColor="muted">
                    {t('park.firstMeetBody')}
                  </ThemedText>
                </ThemedView>
              </>
            ) : null}

            <ThemedText type="heading">{t('park.reviewsTitle')}</ThemedText>
            {reviews.data?.length === 0 ? <ThemedText themeColor="muted">{t('park.reviewsEmpty')}</ThemedText> : null}
            {reviews.data?.slice(0, 3).map((r) => (
              <View
                key={r.id}
                accessible
                accessibilityLabel={[t('park.reviewA11y', { name: r.authorFirstName, rating: r.rating }), r.body].filter(Boolean).join('. ')}
                style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
                <ThemedText type="label">
                  {r.authorFirstName} · {'★'.repeat(r.rating)}
                  <ThemedText type="label" style={{ color: c.border }}>
                    {'★'.repeat(5 - r.rating)}
                  </ThemedText>
                </ThemedText>
                {r.body ? <ThemedText type="caption">{r.body}</ThemedText> : null}
              </View>
            ))}
            <Button label={t('park.addReview')} variant="tertiary" onPress={() => router.push({ pathname: '/review', params: parkParams })} />
            <Button label={t('park.report')} variant="tertiary" onPress={() => router.push({ pathname: '/report', params: parkParams })} />
          </>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  photo: { height: 200, borderRadius: Radius[16] },
  header: { gap: Spacing.one },
  summary: { padding: Spacing.three, borderRadius: Radius[16], gap: 2 },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  row: { minHeight: 44, padding: Spacing.three, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, gap: 2 },
  badge: { minHeight: 32, paddingHorizontal: 12, borderRadius: Radius.full, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  heart: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
