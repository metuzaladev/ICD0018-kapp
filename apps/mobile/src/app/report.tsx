import { parkReportInputSchema } from '@kapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useReportPark } from '@/hooks/use-visits';
import { errorMessage } from '@/lib/api';
import { validateForm } from '@/lib/form';

/** Figma 03 / Park / Report Issue — modal; confirmation replaces the form after sending. */
export default function ReportScreen() {
  const { t } = useTranslation();
  const { parkId, parkName } = useLocalSearchParams<{ parkId: string; parkName?: string }>();
  const report = useReportPark(parkId);
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const { data, errors: invalid } = validateForm(parkReportInputSchema, { description });
    setErrors(invalid ?? {});
    if (!data) return;
    try {
      await report.mutateAsync(data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (report.isSuccess) {
    return (
      <Screen underHeader title={t('report.thanksTitle')} subtitle={t('report.thanksBody')}>
        <Button label={t('common.close')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen underHeader title={t('report.title')} subtitle={parkName}>
      <FormError message={error} />
      <ThemedText themeColor="muted">{t('report.examples')}</ThemedText>
      <TextField
        label={t('report.what')}
        placeholder={t('report.whatPlaceholder')}
        value={description}
        onChangeText={setDescription}
        error={errors.description}
        multiline
        maxLength={1000}
      />
      <ThemedView type="soft" style={styles.card}>
        <ThemedText type="label">{t('report.calmTitle')}</ThemedText>
        <ThemedText type="caption" themeColor="muted">
          {t('report.calmBody')}
        </ThemedText>
      </ThemedView>
      <Button label={t('report.submit')} loading={report.isPending} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius[16], gap: 2 },
});
