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
import { authClient } from '@/lib/auth-client';
import { useParkFilters } from '@/state/park-filters';

/** Figma 02 / Home / Today. Friends' plans arrive with M3 (visits) and M5 (friends). */
export default function HomeScreen() {
  const { data: session } = authClient.useSession();
  const location = useDeviceLocation();
  // Same query key as the map tab, so both screens share one cached request.
  const { data: parks = [] } = useNearbyParks(location.origin, useParkFilters());
  const firstName = session?.user.name.split(' ')[0];

  return (
    <Screen title={firstName ? `Õue, ${firstName}?` : 'Õue?'} subtitle="Täna Tallinnas">
      <OfflineBanner />
      <ThemedView type="soft" style={styles.card}>
        <ThemedText type="heading">Täna võiks koos mängida</ThemedText>
        <ThemedText themeColor="muted">Sõprade plaanid ilmuvad siia, kui külastuste planeerimine on valmis.</ThemedText>
      </ThemedView>
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
