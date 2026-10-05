import type { HealthRecord, HealthRecordKind } from '@kapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { FormError } from '@/components/form-error';
import { ListRow } from '@/components/list-row';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useMyDogs } from '@/hooks/use-dogs';
import { useDeleteHealthRecord, useHealthRecords } from '@/hooks/use-health';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { errorMessage } from '@/lib/api';
import { dueLabel, formatDate, isOverdue } from '@/lib/format';
import { haptic } from '@/lib/haptics';

const SECTIONS = [
  { kind: 'vaccination', title: 'health.vaccinations', add: 'health.addVaccination', empty: 'health.emptyVaccinations' },
  { kind: 'vet_visit', title: 'health.vetVisits', add: 'health.addVetVisit', empty: 'health.emptyVetVisits' },
] as const satisfies readonly { kind: HealthRecordKind; title: string; add: string; empty: string }[];

/** Figma 04 / Dog / Health ("Freddy tervis"): records by kind, add as a modal, delete with confirmation. Owner only. */
export default function DogHealthScreen() {
  const { t } = useTranslation();
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const dog = useMyDogs().data?.find((d) => d.id === dogId);
  const records = useHealthRecords(dogId);
  const remove = useDeleteHealthRecord(dogId);
  const [error, setError] = useState<string | null>(null);
  const refresh = usePullToRefresh(records.refetch);

  const edit = (params: { recordId?: string; kind?: HealthRecordKind }) =>
    router.push({ pathname: '/dogs/[dogId]/health-edit', params: { dogId, ...params } });

  function subtitle(record: HealthRecord) {
    const parts = [formatDate(record.date), record.clinic];
    if (record.nextDue) parts.push(t('health.next', { due: dueLabel(record.nextDue) }));
    return parts.filter(Boolean).join(' · ');
  }

  function confirmDelete(record: HealthRecord) {
    haptic('warning');
    Alert.alert(t('health.deleteTitle', { title: record.title }), t('health.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => remove.mutate(record.id, { onError: (e) => setError(errorMessage(e)) }) },
    ]);
  }

  return (
    // The dog's name is not declined: Figma's "Freddy tervis" needs the genitive ("Maxi tervis"), see docs/11.
    <Screen underHeader title={dog ? t('health.title', { name: dog.name }) : t('health.titleFallback')} subtitle={t('health.subtitle')} refresh={refresh}>
      <OfflineBanner />
      <FormError message={error} />
      <ThemedView type="soft" style={styles.card}>
        <ThemedText type="label">{t('health.introTitle')}</ThemedText>
        <ThemedText type="caption" themeColor="muted">
          {t('health.introBody')}
        </ThemedText>
      </ThemedView>
      {records.error && !records.data ? (
        <ErrorState message={errorMessage(records.error)} onRetry={() => void records.refetch()} retrying={records.isFetching} />
      ) : null}
      {records.isPending ? <SkeletonList /> : null}

      {records.data
        ? SECTIONS.map((section) => {
            const items = records.data.filter((r) => r.kind === section.kind);
            return (
              <View key={section.kind} style={styles.section}>
                <ThemedText type="heading" accessibilityRole="header">
                  {t(section.title)}
                </ThemedText>
                {items.length === 0 ? <ThemedText themeColor="muted">{t(section.empty)}</ThemedText> : null}
                {items.map((record, i) => (
                  <Entering key={record.id} index={i}>
                    <ListRow
                      title={record.title}
                      subtitle={subtitle(record)}
                      alert={record.nextDue !== null && isOverdue(record.nextDue)}
                      accessibilityHint={t('health.rowHint')}
                      onPress={() => edit({ recordId: record.id })}
                      onLongPress={() => confirmDelete(record)}
                    />
                  </Entering>
                ))}
                <Button label={t(section.add)} variant="secondary" onPress={() => edit({ kind: section.kind })} />
              </View>
            );
          })
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius[16], gap: 2 },
  section: { gap: Spacing.two, marginTop: Spacing.two },
});
