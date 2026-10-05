import type { ParkDetail } from '@kapp/shared';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
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
import { dogsLabel, formatTime, reviewsLabel } from '@/lib/format';

const FEATURE_LABELS: [keyof Pick<ParkDetail, 'fenced' | 'smallDogArea' | 'water' | 'lighting'>, string][] = [
  ['fenced', 'Aiaga piiratud'],
  ['smallDogArea', 'Väikeste koerte ala'],
  ['water', 'Joogivesi'],
  ['lighting', 'Valgustus'],
];

/** Opens Apple Maps on iOS and the default maps app on Android with walking directions. */
function openDirections(park: ParkDetail) {
  const label = encodeURIComponent(park.name);
  const url =
    Platform.OS === 'ios'
      ? `maps://?daddr=${park.lat},${park.lng}&dirflg=w&q=${label}`
      : `geo:${park.lat},${park.lng}?q=${park.lat},${park.lng}(${label})`;
  Linking.openURL(url);
}

/** Figma 02 / Park / Overview. */
export default function ParkDetailScreen() {
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
                accessibilityLabel={park.isFavorite ? 'Eemalda lemmikutest' : 'Lisa lemmikutesse'}
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
        {isPending ? <ThemedText themeColor="muted">Laen…</ThemedText> : null}

        {park ? (
          <>
            <Image
              source={require('@/assets/images/park-placeholder.jpg')}
              style={styles.photo}
              contentFit="cover"
              accessibilityLabel="Pargi foto (näidis)"
            />
            <View style={styles.header}>
              <ThemedText type="title" accessibilityRole="header">
                {park.name}
              </ThemedText>
              {park.address ? <ThemedText themeColor="muted">{park.address}</ThemedText> : null}
            </View>

            {hereNow ? (
              <ThemedView type="tint" style={styles.summary}>
                <ThemedText type="heading">Oled pargis kuni {formatTime(hereNow.expiresAt)}</ThemedText>
                <ThemedText type="caption">{hereNow.dogs.map((d) => d.name).join(', ')}</ThemedText>
                <Button
                  label="Lõpeta külastus"
                  variant="secondary"
                  loading={endVisit.isPending}
                  onPress={() => endVisit.mutate(hereNow.id)}
                />
              </ThemedView>
            ) : null}
            {endVisit.error ? <FormError message={errorMessage(endVisit.error)} /> : null}

            <ThemedView type="soft" style={styles.summary}>
              <ThemedText type="heading">{dogsLabel(park.activeDogs ?? 0)} praegu pargis</ThemedText>
              <ThemedText type="caption" themeColor="muted">
                {park.reviewCount > 0
                  ? `${park.ratingAverage?.toLocaleString('et-EE')} / 5 · ${reviewsLabel(park.reviewCount)}`
                  : 'Hinnanguid veel pole'}
              </ThemedText>
            </ThemedView>

            <View style={styles.features}>
              {FEATURE_LABELS.filter(([key]) => park[key]).map(([key, label]) => (
                <View key={key} style={[styles.badge, { borderColor: c.border, backgroundColor: c.surface }]}>
                  <ThemedText type="caption">{label}</ThemedText>
                </View>
              ))}
            </View>

            {park.description ? <ThemedText>{park.description}</ThemedText> : null}

            {!hereNow ? (
              <Button label="Märgi kohalolek" onPress={() => router.push({ pathname: '/check-in', params: parkParams })} />
            ) : null}
            <Button label="Planeeri külastus" variant="secondary" onPress={() => router.push({ pathname: '/plan-visit', params: parkParams })} />
            <Button label="Juhata kohale" variant="secondary" onPress={() => openDirections(park)} />

            {visitors.data && (visitors.data.visitors.length > 0 || visitors.data.hiddenDogs > 0) ? (
              <>
                <ThemedText type="heading">Praegu pargis</ThemedText>
                {visitors.data.visitors.map((v) => (
                  <View key={v.checkInId} style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <ThemedText type="label">
                      {v.isMe ? 'Sina' : v.ownerFirstName} · {v.dogs.map((d) => d.name).join(', ')}
                    </ThemedText>
                    <ThemedText type="caption" themeColor="muted">
                      {v.dogs.map((d) => d.breed).filter(Boolean).join(', ') || 'koer'} · kuni {formatTime(v.until)}
                    </ThemedText>
                  </View>
                ))}
                {visitors.data.hiddenDogs > 0 ? (
                  <ThemedText type="caption" themeColor="muted">
                    + {dogsLabel(visitors.data.hiddenDogs)}, kelle omanik ei jaga oma kohalolekut
                  </ThemedText>
                ) : null}
              </>
            ) : null}

            <ThemedText type="heading">Arvustused</ThemedText>
            {reviews.data?.length === 0 ? <ThemedText themeColor="muted">Ole esimene, kes parki hindab.</ThemedText> : null}
            {reviews.data?.slice(0, 3).map((r) => (
              <View key={r.id} style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
                <ThemedText type="label">
                  {r.authorFirstName} · {'★'.repeat(r.rating)}
                  <ThemedText type="label" style={{ color: c.border }}>
                    {'★'.repeat(5 - r.rating)}
                  </ThemedText>
                </ThemedText>
                {r.body ? <ThemedText type="caption">{r.body}</ThemedText> : null}
              </View>
            ))}
            <Button label="Lisa oma hinnang" variant="tertiary" onPress={() => router.push({ pathname: '/review', params: parkParams })} />
            <Button label="Märkasid probleemi?" variant="tertiary" onPress={() => router.push({ pathname: '/report', params: parkParams })} />
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
  row: { padding: Spacing.three, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, gap: 2 },
  badge: { minHeight: 32, paddingHorizontal: 12, borderRadius: Radius.full, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  heart: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
