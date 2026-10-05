import type { HealthRecord, HealthRecordKind } from '@kapp/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { ListRow } from '@/components/list-row';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useMyDogs } from '@/hooks/use-dogs';
import { useDeleteHealthRecord, useHealthRecords } from '@/hooks/use-health';
import { errorMessage } from '@/lib/api';
import { dueLabel, formatDate } from '@/lib/format';

const SECTIONS: { kind: HealthRecordKind; title: string; add: string; empty: string }[] = [
  { kind: 'vaccination', title: 'Vaktsineerimised', add: 'Lisa vaktsineerimine', empty: 'Vaktsineerimisi pole veel lisatud.' },
  { kind: 'vet_visit', title: 'Arstivisiidid', add: 'Lisa arstivisiit', empty: 'Arstivisiite pole veel lisatud.' },
];

function subtitle(record: HealthRecord) {
  const parts = [formatDate(record.date), record.clinic];
  if (record.nextDue) parts.push(`järgmine ${dueLabel(record.nextDue)}`);
  return parts.filter(Boolean).join(' · ');
}

/** Figma 04 / Dog / Health: records by kind, add as a modal, delete with confirmation. Owner only. */
export default function DogHealthScreen() {
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const dog = useMyDogs().data?.find((d) => d.id === dogId);
  const records = useHealthRecords(dogId);
  const remove = useDeleteHealthRecord(dogId);
  const [error, setError] = useState<string | null>(null);

  const edit = (params: { recordId?: string; kind?: HealthRecordKind }) =>
    router.push({ pathname: '/dogs/[dogId]/health-edit', params: { dogId, ...params } });

  function confirmDelete(record: HealthRecord) {
    Alert.alert(`Kustutada „${record.title}"?`, 'Kirjet ei saa taastada.', [
      { text: 'Loobu', style: 'cancel' },
      { text: 'Kustuta', style: 'destructive', onPress: () => remove.mutate(record.id, { onError: (e) => setError(errorMessage(e)) }) },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: dog ? `${dog.name} · tervis` : 'Tervis' }} />
      <Screen underHeader subtitle="Tervisekirjed on nähtavad ainult sulle.">
        <OfflineBanner />
        <FormError message={error} />
        {records.error && !records.data ? <FormError message={errorMessage(records.error)} /> : null}
        {records.isPending ? <ThemedText themeColor="muted">Laen…</ThemedText> : null}

        {records.data
          ? SECTIONS.map((section) => {
              const items = records.data.filter((r) => r.kind === section.kind);
              return (
                <View key={section.kind} style={styles.section}>
                  <ThemedText type="heading" accessibilityRole="header">
                    {section.title}
                  </ThemedText>
                  {items.length === 0 ? <ThemedText themeColor="muted">{section.empty}</ThemedText> : null}
                  {items.map((record) => (
                    <ListRow
                      key={record.id}
                      title={record.title}
                      subtitle={subtitle(record)}
                      alert={record.nextDue !== null && dueLabel(record.nextDue).endsWith('hilinenud')}
                      accessibilityHint="Muuda kirjet. Pikk vajutus kustutab."
                      onPress={() => edit({ recordId: record.id })}
                      onLongPress={() => confirmDelete(record)}
                    />
                  ))}
                  <Button label={section.add} variant="secondary" onPress={() => edit({ kind: section.kind })} />
                </View>
              );
            })
          : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two, marginTop: Spacing.two },
});
