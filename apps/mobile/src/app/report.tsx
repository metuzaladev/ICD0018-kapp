import { parkReportInputSchema } from '@kapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useReportPark } from '@/hooks/use-visits';
import { errorMessage } from '@/lib/api';
import { validateForm } from '@/lib/form';

/** Figma 03 / Park / Report Issue — modal; confirmation replaces the form after sending. */
export default function ReportScreen() {
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
      <Screen underHeader title="Aitäh!" subtitle="Vaatame teate üle ja anname teistele pargikülastajatele teada, kui see on oluline.">
        <Button label="Sulge" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen underHeader title="Märkasid probleemi?" subtitle={parkName}>
      <FormError message={error} />
      <ThemedText themeColor="muted">Näiteks katkine värav, klaasikillud või mürgikahtlus. Ohu korral helista 112.</ThemedText>
      <TextField
        label="Mis juhtus?"
        placeholder="Kirjelda ohtu ja selle täpset asukohta"
        value={description}
        onChangeText={setDescription}
        error={errors.description}
        multiline
        maxLength={1000}
      />
      <Button label="Saada teavitus" loading={report.isPending} onPress={submit} />
    </Screen>
  );
}
