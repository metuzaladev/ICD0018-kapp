import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { OfflineBanner } from '@/components/offline-banner';
import { ParkRow } from '@/components/park-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { useNearbyParks } from '@/hooks/use-parks';
import { useActiveCheckIn, usePlannedVisits } from '@/hooks/use-visits';
import { authClient } from '@/lib/auth-client';
import { formatDay, formatTime } from '@/lib/format';
import { useParkFilters } from '@/state/park-filters';

/** Figma 02 / Home / Today: current visit, own plans, nearby parks. Friends' plans arrive in M5. */
export default function HomeScreen() {
  const { data: session } = authClient.useSession();
  const location = useDeviceLocation();
  // Same query key as the map tab, so both screens share one cached request.
  const { data: parks = [] } = useNearbyParks(location.origin, useParkFilters());
  const { data: active } = useActiveCheckIn();
  const { data: plans = [] } = usePlannedVisits();
  const firstName = session?.user.name.split(' ')[0];
  const openPark = (parkId: string) => router.push({ pathname: '/parks/[parkId]', params: { parkId } });

  return (
    <Screen title={firstName ? `Õue, ${firstName}?` : 'Õue?'} subtitle="Täna Tallinnas">
      <OfflineBanner />

      {active ? (
        <ThemedView type="tint" style={styles.card}>
          {/* Park names are not declined ("Kadrioru koerapark" → "koerapargis"); a label avoids wrong grammar. */}
          <ThemedText type="caption" themeColor="muted">
            OLED PARGIS
          </ThemedText>
          <ThemedText type="heading">{active.park.name}</ThemedText>
          <ThemedText>
            {active.dogs.map((d) => d.name).join(', ')} · kuni {formatTime(active.expiresAt)}
          </ThemedText>
          <Button label="Ava park" variant="secondary" onPress={() => openPark(active.park.id)} />
        </ThemedView>
      ) : (
        <ThemedView type="soft" style={styles.card}>
          <ThemedText type="heading">Täna võiks koos mängida</ThemedText>
          <ThemedText themeColor="muted">Märgi pargis kohalolek või planeeri käik, et sõbrad teaksid tulla.</ThemedText>
        </ThemedView>
      )}

      {plans.slice(0, 2).map((p) => (
        <ThemedView key={p.id} type="surface" style={styles.card}>
          <ThemedText type="label">{p.park.name}</ThemedText>
          <ThemedText type="caption" themeColor="muted">
            Plaanis {formatDay(p.startsAt)} {formatTime(p.startsAt)}–{formatTime(p.endsAt)}
          </ThemedText>
        </ThemedView>
      ))}

      <Button label="Leia lähim park" onPress={() => router.navigate('/map')} />

      {parks.length > 0 ? (
        <>
          <ThemedText type="heading">Teie lähedal</ThemedText>
          {parks.slice(0, 3).map((park) => (
            <ParkRow key={park.id} park={park} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.four, borderRadius: Radius[16], gap: Spacing.two },
});
