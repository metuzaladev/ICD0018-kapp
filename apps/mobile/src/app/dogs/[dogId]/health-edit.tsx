import {
  healthRecordInputSchema,
  REMINDER_WINDOW_DAYS,
  updateHealthRecordInputSchema,
  type HealthRecord,
  type HealthRecordKind,
} from '@kapp/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { Button } from '@/components/button';
import { SegmentedControl } from '@/components/segmented-control';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useMyDogs } from '@/hooks/use-dogs';
import { useDeleteHealthRecord, useHealthRecords, useSaveHealthRecord } from '@/hooks/use-health';
import { errorMessage } from '@/lib/api';
import { localIsoDate } from '@/lib/format';
import { validateForm } from '@/lib/form';
import { haptic } from '@/lib/haptics';

type FormValues = { kind: HealthRecordKind; title: string; date: string; nextDue: string; clinic: string; notes: string };

/** Per-kind texts: Figma "Health / Add Vaccination" and "Health / Vet Visit". */
const KIND_TEXT = {
  vaccination: {
    screen: 'nav.vaccinationAdd',
    title: 'health.edit.vaccinationTitle',
    placeholder: 'health.edit.vaccinationPlaceholder',
    save: 'common.save',
  },
  vet_visit: {
    screen: 'nav.vetVisitAdd',
    title: 'health.edit.vetVisitTitle',
    placeholder: 'health.edit.vetVisitPlaceholder',
    save: 'health.edit.saveVetVisit',
  },
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
 * "Lisa vaktsineerimine" / "Loomaarsti külastus" and editing (recordId) — a modal like dogs/edit.
 * The form mounts once the record is known, so fields start with the stored values.
 */
export default function HealthEditScreen() {
  const { t } = useTranslation();
  const { dogId, recordId, kind } = useLocalSearchParams<{ dogId: string; recordId?: string; kind?: HealthRecordKind }>();
  const { data: records, isPending } = useHealthRecords(dogId);
  const existing = records?.find((r) => r.id === recordId);
  const initialKind = existing?.kind ?? (kind === 'vet_visit' ? 'vet_visit' : 'vaccination');

  return (
    <>
      <Stack.Screen options={{ title: recordId ? t('nav.healthRecordEdit') : t(KIND_TEXT[initialKind].screen) }} />
      {recordId && isPending ? (
        <Screen underHeader>
          <SkeletonList rows={3} rowHeight={72} />
        </Screen>
      ) : recordId && !existing ? (
        <Screen underHeader>
          <FormError message={t('health.edit.notFound')} />
        </Screen>
      ) : (
        <HealthForm dogId={dogId} existing={existing} kind={initialKind} />
      )}
    </>
  );
}

function HealthForm({ dogId, existing, kind }: { dogId: string; existing?: HealthRecord; kind: HealthRecordKind }) {
  const { t } = useTranslation();
  const dog = useMyDogs().data?.find((d) => d.id === dogId);
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
    haptic('warning');
    Alert.alert(t('health.deleteTitle', { title: existing.title }), t('health.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => remove.mutate(existing.id, { onSuccess: () => router.back(), onError: (e) => setFormError(errorMessage(e)) }),
      },
    ]);
  }

  return (
    <Screen underHeader subtitle={dog ? t('health.edit.subtitle', { name: dog.name }) : undefined}>
      <FormError message={formError} />
      <ThemedText type="label">{t('health.edit.kind')}</ThemedText>
      <SegmentedControl
        accessibilityLabel={t('health.edit.kind')}
        options={[
          { value: 'vaccination', label: t('health.edit.vaccination') },
          { value: 'vet_visit', label: t('health.edit.vetVisit') },
        ]}
        value={values.kind}
        onChange={(kind) => kind && setValues((v) => ({ ...v, kind }))}
      />
      <TextField label={t(text.title)} placeholder={t(text.placeholder)} value={values.title} onChangeText={set('title')} error={errors.title} />
      <TextField
        label={t('health.edit.date')}
        placeholder={t('health.edit.datePlaceholder')}
        value={values.date}
        onChangeText={set('date')}
        error={errors.date}
        keyboardType="numbers-and-punctuation"
      />
      <TextField
        label={t('health.edit.nextDue')}
        placeholder={t('health.edit.datePlaceholder')}
        value={values.nextDue}
        onChangeText={set('nextDue')}
        error={errors.nextDue}
        keyboardType="numbers-and-punctuation"
      />
      <ThemedText type="caption" themeColor="muted">
        {t('health.edit.reminderHint', { count: REMINDER_WINDOW_DAYS })}
      </ThemedText>
      <TextField
        label={t('health.edit.clinic')}
        placeholder={t('health.edit.clinicPlaceholder')}
        value={values.clinic}
        onChangeText={set('clinic')}
        error={errors.clinic}
      />
      <TextField
        label={t('health.edit.notes')}
        placeholder={t('health.edit.notesPlaceholder')}
        value={values.notes}
        onChangeText={set('notes')}
        error={errors.notes}
        multiline
        maxLength={2000}
      />
      <Button label={existing ? t('common.save') : t(text.save)} loading={save.isPending} onPress={submit} />
      {existing ? <Button label={t('health.edit.delete')} variant="tertiary" loading={remove.isPending} onPress={confirmDelete} /> : null}
    </Screen>
  );
}
