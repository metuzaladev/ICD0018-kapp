import { healthRecordInputSchema, updateHealthRecordInputSchema, type HealthRecord, type HealthRecordKind } from '@kapp/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useDeleteHealthRecord, useHealthRecords, useSaveHealthRecord } from '@/hooks/use-health';
import { errorMessage } from '@/lib/api';
import { localIsoDate } from '@/lib/format';
import { validateForm } from '@/lib/form';

type FormValues = { kind: HealthRecordKind; title: string; date: string; nextDue: string; clinic: string; notes: string };

const KIND_TEXT = {
  vaccination: { add: 'Lisa vaktsineerimine', title: 'Vaktsiin', placeholder: 'Näiteks marutaud', next: 'Järgmine vaktsineerimine' },
  vet_visit: { add: 'Lisa arstivisiit', title: 'Visiidi põhjus', placeholder: 'Näiteks hambakontroll', next: 'Järgmine kontroll' },
} as const;

function initialValues(record: HealthRecord | undefined, kind: HealthRecordKind): FormValues {
  return {
    kind: record?.kind ?? kind,
    title: record?.title ?? '',
    date: record?.date ?? localIsoDate(),
    nextDue: record?.nextDue ?? '',
    clinic: record?.clinic ?? '',
    notes: record?.notes ?? '',
  };
}

/** Text fields hold strings; an empty next due date means "none" (null), not "unchanged". */
const toInput = (v: FormValues) => ({ ...v, date: v.date.trim(), nextDue: v.nextDue.trim() || null });

/**
 * "Lisa vaktsineerimine" / "Lisa arstivisiit" and editing (recordId) — a modal like dogs/edit.
 * The form mounts once the record is known, so fields start with the stored values.
 */
export default function HealthEditScreen() {
  const { dogId, recordId, kind } = useLocalSearchParams<{ dogId: string; recordId?: string; kind?: HealthRecordKind }>();
  const { data: records, isPending } = useHealthRecords(dogId);
  const existing = records?.find((r) => r.id === recordId);
  const initialKind = existing?.kind ?? (kind === 'vet_visit' ? 'vet_visit' : 'vaccination');

  return (
    <>
      <Stack.Screen options={{ title: recordId ? 'Muuda kirjet' : KIND_TEXT[initialKind].add }} />
      {recordId && isPending ? (
        <Screen underHeader>
          <ThemedText themeColor="muted">Laen…</ThemedText>
        </Screen>
      ) : recordId && !existing ? (
        <Screen underHeader>
          <FormError message="Tervisekirjet ei leitud" />
        </Screen>
      ) : (
        <HealthForm dogId={dogId} existing={existing} kind={initialKind} />
      )}
    </>
  );
}

function HealthForm({ dogId, existing, kind }: { dogId: string; existing?: HealthRecord; kind: HealthRecordKind }) {
  const save = useSaveHealthRecord(dogId, existing?.id);
  const remove = useDeleteHealthRecord(dogId);
  const [values, setValues] = useState<FormValues>(() => initialValues(existing, kind));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const text = KIND_TEXT[values.kind];

  const set = (key: Exclude<keyof FormValues, 'kind'>) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function submit() {
    // The form always holds every field, so the create schema (which also checks nextDue > date)
    // validates edits on the device too; the PATCH then sends all fields and the server re-checks.
    const { data, errors: invalid } = validateForm(healthRecordInputSchema, toInput(values));
    setErrors(invalid ?? {});
    setFormError(null);
    if (!data) return;
    const payload = existing ? validateForm(updateHealthRecordInputSchema, data).data : data;
    if (!payload) return;
    try {
      await save.mutateAsync(payload);
      router.back();
    } catch (e) {
      setFormError(errorMessage(e));
    }
  }

  function confirmDelete() {
    if (!existing) return;
    Alert.alert(`Kustutada „${existing.title}"?`, 'Kirjet ei saa taastada.', [
      { text: 'Loobu', style: 'cancel' },
      {
        text: 'Kustuta',
        style: 'destructive',
        onPress: () => remove.mutate(existing.id, { onSuccess: () => router.back(), onError: (e) => setFormError(errorMessage(e)) }),
      },
    ]);
  }

  return (
    <Screen underHeader>
      <FormError message={formError} />
      <ThemedText type="label">Liik</ThemedText>
      <View style={styles.chips}>
        <Chip label="Vaktsineerimine" selected={values.kind === 'vaccination'} onPress={() => setValues((v) => ({ ...v, kind: 'vaccination' }))} />
        <Chip label="Arstivisiit" selected={values.kind === 'vet_visit'} onPress={() => setValues((v) => ({ ...v, kind: 'vet_visit' }))} />
      </View>
      <TextField label={text.title} placeholder={text.placeholder} value={values.title} onChangeText={set('title')} error={errors.title} />
      <TextField
        label="Kuupäev"
        placeholder="AAAA-KK-PP"
        value={values.date}
        onChangeText={set('date')}
        error={errors.date}
        keyboardType="numbers-and-punctuation"
      />
      <TextField
        label={`${text.next} (valikuline)`}
        placeholder="AAAA-KK-PP"
        value={values.nextDue}
        onChangeText={set('nextDue')}
        error={errors.nextDue}
        keyboardType="numbers-and-punctuation"
      />
      <ThemedText type="caption" themeColor="muted">
        Tähtaja lähenedes (30 päeva) ilmub meeldetuletus avalehele.
      </ThemedText>
      <TextField label="Kliinik (valikuline)" value={values.clinic} onChangeText={set('clinic')} error={errors.clinic} />
      <TextField
        label="Märkmed (valikuline)"
        value={values.notes}
        onChangeText={set('notes')}
        error={errors.notes}
        multiline
        maxLength={2000}
      />
      <Button label={existing ? 'Salvesta' : text.add} loading={save.isPending} onPress={submit} />
      {existing ? <Button label="Kustuta kirje" variant="tertiary" loading={remove.isPending} onPress={confirmDelete} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: Spacing.two },
});
