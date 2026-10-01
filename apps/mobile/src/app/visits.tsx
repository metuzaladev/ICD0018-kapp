import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCancelPlan, usePlannedVisits, useVisitHistory } from '@/hooks/use-visits';
import { errorMessage } from '@/lib/api';
import { formatDay, formatDuration, formatTime } from '@/lib/format';

/** Figma 03 / Visits / History, plus the user's upcoming plans. */
export default function VisitsScreen() {
  const c = useTheme();
  const history = useVisitHistory();
  const plans = usePlannedVisits();
  const cancel = useCancelPlan();
  const card = [styles.card, { backgroundColor: c.surface, borderColor: c.border }];

  return (
    <Screen underHeader title="Minu külastused" subtitle="Iga käik on üks väike seiklus.">
      <OfflineBanner />
      {history.error && !history.data ? <FormError message={errorMessage(history.error)} /> : null}
      {cancel.error ? <FormError message={errorMessage(cancel.error)} /> : null}

      {plans.data && plans.data.length > 0 ? (
        <>
          <ThemedText type="heading">Plaanis</ThemedText>
          {plans.data.map((p) => (
            <ThemedView key={p.id} style={card}>
              <ThemedText type="label">{p.park.name}</ThemedText>
              <ThemedText type="caption" themeColor="muted">
                {formatDay(p.startsAt)} · {formatTime(p.startsAt)}–{formatTime(p.endsAt)}
              </ThemedText>
              {p.note ? <ThemedText type="caption">{p.note}</ThemedText> : null}
              <Button label="Tühista plaan" variant="tertiary" disabled={cancel.isPending} onPress={() => cancel.mutate(p.id)} />
            </ThemedView>
          ))}
        </>
      ) : null}

      <ThemedText type="heading">Varasemad</ThemedText>
      {history.data?.length === 0 ? (
        <ThemedText themeColor="muted">Külastusi veel pole. Pargis märgi kohalolek, siis jääb käik siia meelde.</ThemedText>
      ) : null}
      {history.data?.map((v) => (
        <ThemedView key={v.id} style={card}>
          <View style={styles.headerRow}>
            <ThemedText type="label" style={styles.flex}>
              {v.park.name}
            </ThemedText>
            <ThemedText type="caption" themeColor="muted">
              {formatDuration(v.durationMinutes)}
            </ThemedText>
          </View>
          <ThemedText type="caption" themeColor="muted">
            {formatDay(v.startedAt)} · {formatTime(v.startedAt)} · {v.dogs.map((d) => d.name).join(', ') || '—'}
          </ThemedText>
          {!v.hasReview ? (
            <Button
              label="Lisa hinnang"
              variant="tertiary"
              onPress={() => router.push({ pathname: '/review', params: { parkId: v.park.id, parkName: v.park.name } })}
            />
          ) : null}
        </ThemedView>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, gap: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
});
