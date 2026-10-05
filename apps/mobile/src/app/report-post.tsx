import { PLACE_REPORT_REASONS, placePostReportInputSchema } from '@kapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FormError } from '@/components/form-error';
import { InfoCard } from '@/components/info-card';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useReportPlacePost } from '@/hooks/use-explore';
import { errorMessage } from '@/lib/api';
import { validateForm } from '@/lib/form';
import { haptic } from '@/lib/haptics';

type Reason = (typeof PLACE_REPORT_REASONS)[number];

/**
 * "Teavita postitusest" — modal, the same shape as Safety / Report or Block (report-user.tsx).
 * One report per person and post; a repeated send returns the same report (docs/16).
 */
export default function ReportPostScreen() {
  const { t } = useTranslation();
  const { postId, name } = useLocalSearchParams<{ postId: string; name?: string }>();
  const report = useReportPlacePost(postId);
  const [reason, setReason] = useState<Reason>('wrong_info');
  const [details, setDetails] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    const { data, errors: invalid } = validateForm(placePostReportInputSchema, { reason, details });
    setErrors(invalid ?? {});
    setFormError(null);
    if (!data) return;
    try {
      await report.mutateAsync(data);
      haptic('success');
      setSent(true);
    } catch (e) {
      haptic('error');
      setFormError(errorMessage(e));
    }
  }

  if (sent) {
    return (
      <Screen underHeader title={t('safety.thanksTitle')}>
        <InfoCard title={t('explore.report.thanksTitle')} body={t('explore.report.thanksBody')} />
        <Button label={t('common.close')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen underHeader title={t('explore.report.title')} subtitle={name}>
      <FormError message={formError} />
      <ThemedText type="heading">{t('explore.report.why')}</ThemedText>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {PLACE_REPORT_REASONS.map((r) => (
          <Chip key={r} role="radio" label={t(`explore.report.reasons.${r}`)} selected={reason === r} onPress={() => setReason(r)} />
        ))}
      </View>
      <TextField
        label={t('safety.what')}
        placeholder={t('explore.report.placeholder')}
        value={details}
        onChangeText={setDetails}
        error={errors.details}
        multiline
        maxLength={1000}
      />
      <InfoCard title={t('safety.privateTitle')} body={t('safety.privateBody')} />
      <Button label={t('safety.send')} loading={report.isPending} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
