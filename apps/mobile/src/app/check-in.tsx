import { CHECK_IN_DURATIONS, checkInInputSchema } from '@kapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useMyDogs } from '@/hooks/use-dogs';
import { useCheckIn } from '@/hooks/use-visits';
import { errorMessage } from '@/lib/api';
import { formatDurationShort } from '@/lib/format';
import { validateForm } from '@/lib/form';

/** Figma 03 / Visit / Check In — modal: which dogs, how long. */
export default function CheckInScreen() {
  const { t } = useTranslation();
  const { parkId, parkName } = useLocalSearchParams<{ parkId: string; parkName?: string }>();
  const { data: dogs, isPending } = useMyDogs();
  const checkIn = useCheckIn();
  // null = "user has not chosen yet"; then one dog is preselected so check-in is a single tap.
  const [chosen, setChosen] = useState<string[] | null>(null);
  const selected = chosen ?? (dogs?.length === 1 ? [dogs[0]!.id] : []);
  const [duration, setDuration] = useState<number>(60);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setChosen(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  async function submit() {
    const { data, errors } = validateForm(checkInInputSchema, { parkId, dogIds: selected, durationMinutes: duration });
    if (!data) return setError(Object.values(errors)[0] ?? t('errors.checkChoices'));
    setError(null);
    try {
      await checkIn.mutateAsync(data);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Screen underHeader title={t('checkIn.title')} subtitle={parkName}>
      <FormError message={error} />
      {isPending ? <ThemedText themeColor="muted">{t('common.loading')}</ThemedText> : null}

      {dogs?.length === 0 ? (
        <>
          <ThemedText themeColor="muted">{t('checkIn.noDogs')}</ThemedText>
          <Button label={t('checkIn.addDog')} variant="secondary" onPress={() => router.push('/dogs/edit')} />
        </>
      ) : null}

      {dogs && dogs.length > 0 ? (
        <>
          <ThemedText type="heading">{t('checkIn.who')}</ThemedText>
          <View style={styles.wrap}>
            {dogs.map((dog) => (
              <View key={dog.id} style={styles.half}>
                <Chip label={dog.name} selected={selected.includes(dog.id)} onPress={() => toggle(dog.id)} />
              </View>
            ))}
          </View>

          <ThemedText type="heading">{t('checkIn.duration')}</ThemedText>
          <View style={styles.row}>
            {CHECK_IN_DURATIONS.map((m) => (
              <Chip key={m} label={formatDurationShort(m)} selected={duration === m} onPress={() => setDuration(m)} />
            ))}
          </View>

          <ThemedText type="caption" themeColor="muted">
            {t('checkIn.expiry', { count: duration })} {t('checkIn.privacy')}
          </ThemedText>
          <Button label={t('checkIn.submit')} loading={checkIn.isPending} onPress={submit} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  half: { minWidth: '30%', flexGrow: 1 },
  row: { flexDirection: 'row', gap: Spacing.two },
});
