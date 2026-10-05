import type { ParkDetail } from '@kapp/shared';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useParkDetail, useToggleFavorite } from '@/hooks/use-parks';
import { useActiveCheckIn, useEndCheckIn, useParkReviews, useParkVisitors } from '@/hooks/use-visits';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { formatKm, formatRating, formatTime, reviewsLabel } from '@/lib/format';

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

/** Figma 02 / Park / Overview, with the Visitors and Reviews tabs as sections of one scroll. */
export default function ParkDetailScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const { parkId } = useLocalSearchParams<{ parkId: string }>();
  const { data: park, error, isPending } = useParkDetail(parkId);
  const favorite = useToggleFavorite(parkId);
  const active = useActiveCheckIn();
  const endVisit = useEndCheckIn();
  const visitors = useParkVisitors(parkId);
  const reviews = useParkReviews(parkId);
  const hereNow = active.data?.park.id === parkId ? active.data : null;
  const parkParams = { parkId, parkName: park?.name ?? '' };

  const heart = park?.isFavorite ? '♥' : '♡';

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
                onPress={() => favorite.mutate(!park.isFavorite)}>
                <ThemedText type="hero" style={{ color: c.brand }}>
                  {heart}
                </ThemedText>
              </Pressable>
            ) : null,
        }}
      />
      <Screen underHeader>
        <OfflineBanner />
        {error && !park ? <FormError message={errorMessage(error)} /> : null}
        {favorite.error ? <FormError message={errorMessage(favorite.error)} /> : null}
        {isPending ? <ThemedText themeColor="muted">{t('common.loading')}</ThemedText> : null}

        {park ? (
          <>
            <Image
              source={require('@/assets/images/park-placeholder.jpg')}
              style={styles.photo}
              contentFit="cover"
              accessibilityLabel={t('park.photoLabel')}
            />
            <View style={styles.header}>
              <ThemedText type="title" accessibilityRole="header">
                {park.name}
              </ThemedText>
              {/* Figma: "1,2 km · Kesklinn, Tallinn". */}
              {park.address || park.distanceKm !== undefined ? (
                <ThemedText themeColor="muted">{[formatKm(park.distanceKm), park.address].filter(Boolean).join(' · ')}</ThemedText>
              ) : null}
            </View>

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
                {visitors.data.visitors.map((v) => (
                  <Pressable
                    key={v.checkInId}
                    // Figma: "Ava koera profiil ja saada omanikule sõbrakutse" — a visitor opens their profile.
                    disabled={v.isMe}
                    accessibilityRole={v.isMe ? undefined : 'button'}
                    accessibilityHint={v.isMe ? undefined : t('park.visitorHint')}
                    onPress={() => router.push({ pathname: '/users/[userId]', params: { userId: v.userId } })}
                    style={({ pressed }) => [styles.row, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.8 : 1 }]}>
                    <ThemedText type="label">
                      {[v.isMe ? t('common.you') : v.ownerFirstName, v.dogs.map((d) => d.name).join(', ')].join(' · ')}
                    </ThemedText>
                    <ThemedText type="caption" themeColor="muted">
                      {t('park.visitorDetails', {
                        breeds: v.dogs.map((d) => d.breed).filter(Boolean).join(', ') || t('common.dog'),
                        time: formatTime(v.until),
                      })}
                    </ThemedText>
                  </Pressable>
                ))}
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
