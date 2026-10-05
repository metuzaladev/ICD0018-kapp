import { dogInputSchema, updateDogInputSchema, type Dog, type DogSex } from '@kapp/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useDeleteDog, useMyDogs, useSaveDog } from '@/hooks/use-dogs';
import { errorMessage } from '@/lib/api';
import { validateForm } from '@/lib/form';
import { haptic } from '@/lib/haptics';

/** Text fields hold strings; this turns them into the API shape (empty → null, "12,5" → 12.5). */
function toInput(values: FormValues) {
  const weight = values.weightKg.trim().replace(',', '.');
  return {
    name: values.name,
    breed: values.breed,
    sex: values.sex,
    birthDate: values.birthDate.trim() || null,
    weightKg: weight === '' ? null : Number(weight),
    temperament: values.temperament,
  };
}

type FormValues = { name: string; breed: string; birthDate: string; weightKg: string; temperament: string; sex: DogSex | null };

function initialValues(dog: Dog | undefined): FormValues {
  return {
    name: dog?.name ?? '',
    breed: dog?.breed ?? '',
    birthDate: dog?.birthDate ?? '',
    weightKg: dog?.weightKg?.toString().replace('.', ',') ?? '',
    temperament: dog?.temperament ?? '',
    sex: dog?.sex ?? null,
  };
}

/**
 * Figma 04 / Dog / Edit Profile — also used for adding (no dogId). Presented as a modal.
 * The form mounts only once the dog is known, so its fields start with the right values
 * (no state copying in an effect).
 */
export default function DogEditScreen() {
  const { t } = useTranslation();
  const { dogId } = useLocalSearchParams<{ dogId?: string }>();
  const { data: dogs, isPending } = useMyDogs();
  const existing = dogs?.find((d) => d.id === dogId);

  return (
    <>
      <Stack.Screen options={{ title: dogId ? t('nav.dogEdit') : t('nav.dogAdd') }} />
      {dogId && isPending ? (
        <Screen underHeader>
          <SkeletonList rows={3} rowHeight={72} />
        </Screen>
      ) : dogId && !existing ? (
        <Screen underHeader>
          <FormError message={t('dogs.profile.notFound')} />
        </Screen>
      ) : (
        <DogForm dogId={dogId} existing={existing} />
      )}
    </>
  );
}

function DogForm({ dogId, existing }: { dogId?: string; existing?: Dog }) {
  const { t } = useTranslation();
  const save = useSaveDog(dogId);
  const remove = useDeleteDog(dogId ?? '');
  const [values, setValues] = useState<FormValues>(() => initialValues(existing));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = (key: Exclude<keyof FormValues, 'sex'>) => (text: string) => setValues((v) => ({ ...v, [key]: text }));

  async function submit() {
    const { data, errors: invalid } = validateForm(dogId ? updateDogInputSchema : dogInputSchema, toInput(values));
    setErrors(invalid ?? {});
    setFormError(null);
    if (!data) return;
    try {
      await save.mutateAsync(data);
      router.back();
    } catch (e) {
      setFormError(errorMessage(e));
    }
  }

  function confirmDelete() {
    // Destructive and irreversible: confirm with the system alert (HIG), destructive style.
    haptic('warning');
    Alert.alert(t('dogs.edit.deleteTitle', { name: existing?.name ?? '' }), t('dogs.edit.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          // Back to the list: the profile underneath belongs to the dog that no longer exists.
          remove.mutate(undefined, { onSuccess: () => router.dismissTo('/dogs'), onError: (e) => setFormError(errorMessage(e)) }),
      },
    ]);
  }

  return (
    <Screen underHeader title={t('dogs.edit.title')} subtitle={t('dogs.edit.subtitle')}>
      <FormError message={formError} />
      <TextField label={t('dogs.edit.name')} value={values.name} onChangeText={set('name')} error={errors.name} autoCapitalize="words" />
      <TextField label={t('dogs.edit.breed')} placeholder={t('dogs.edit.breedPlaceholder')} value={values.breed} onChangeText={set('breed')} error={errors.breed} />
      <ThemedText type="label">{t('dogs.edit.sex')}</ThemedText>
      <View style={styles.chips}>
        <Chip label={t('dogs.edit.male')} selected={values.sex === 'male'} onPress={() => setValues((v) => ({ ...v, sex: v.sex === 'male' ? null : 'male' }))} />
        <Chip label={t('dogs.edit.female')} selected={values.sex === 'female'} onPress={() => setValues((v) => ({ ...v, sex: v.sex === 'female' ? null : 'female' }))} />
      </View>
      <TextField
        label={t('dogs.edit.birthDate')}
        placeholder={t('dogs.edit.datePlaceholder')}
        value={values.birthDate}
        onChangeText={set('birthDate')}
        error={errors.birthDate}
        keyboardType="numbers-and-punctuation"
      />
      <TextField label={t('dogs.edit.weight')} placeholder={t('dogs.edit.weightPlaceholder')} value={values.weightKg} onChangeText={set('weightKg')} error={errors.weightKg} keyboardType="decimal-pad" />
      <TextField
        label={t('dogs.edit.temperament')}
        placeholder={t('dogs.edit.temperamentPlaceholder')}
        value={values.temperament}
        onChangeText={set('temperament')}
        error={errors.temperament}
        multiline
        maxLength={500}
      />
      <Button label={dogId ? t('dogs.edit.save') : t('dogs.edit.add')} loading={save.isPending} onPress={submit} />
      {dogId ? <Button label={t('dogs.edit.delete')} variant="tertiary" loading={remove.isPending} onPress={confirmDelete} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
