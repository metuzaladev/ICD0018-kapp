import type { Park } from '@kapp/shared';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiGet, ApiRequestError } from '@/lib/api';

// Tallinn city centre until device location is wired up (milestone M2).
const ORIGIN = { lat: 59.437, lng: 24.7536 };

export default function MapScreen() {
  const c = useTheme();
  const [parks, setParks] = useState<Park[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Park[]>('/parks/nearby', { ...ORIGIN, radiusKm: 10 })
      .then(setParks)
      .catch((e: unknown) => setError(e instanceof ApiRequestError ? e.message : 'Midagi läks valesti'));
  }, []);

  return (
    <Screen title="Avastame Tallinna." subtitle="Kaart (MapLibre) tuleb siia; praegu nimekiri API-st.">
      {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
      {parks?.map((p) => (
        <ThemedView key={p.id} type="surface" style={[styles.row, { borderColor: c.border }]}>
          <ThemedText type="smallBold">{p.name}</ThemedText>
          <ThemedText type="small" themeColor="muted">
            {p.distanceKm} km · {p.activeDogs ?? 0} koera praegu
          </ThemedText>
        </ThemedView>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { padding: Spacing.three, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, gap: 2 },
});
