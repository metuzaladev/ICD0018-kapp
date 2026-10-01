import type { ParkDetail } from '@kapp/shared';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useParkDetail, useToggleFavorite } from '@/hooks/use-parks';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';

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

            <ThemedView type="soft" style={styles.summary}>
              <ThemedText type="heading">
                {park.activeDogs ?? 0} {park.activeDogs === 1 ? 'koer' : 'koera'} praegu pargis
              </ThemedText>
              <ThemedText type="caption" themeColor="muted">
                {park.reviewCount > 0
                  ? `${park.ratingAverage?.toLocaleString('et-EE')} / 5 · ${park.reviewCount} hinnangut`
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

            <Button label="Juhata kohale" onPress={() => openDirections(park)} />
            <Button label="Märgi kohalolek (tuleb peagi)" variant="secondary" disabled />
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
  badge: { minHeight: 32, paddingHorizontal: 12, borderRadius: Radius.full, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  heart: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
