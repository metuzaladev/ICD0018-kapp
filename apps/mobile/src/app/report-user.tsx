import { USER_REPORT_REASONS, userReportInputSchema } from '@kapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useBlockUser, useReportUser } from '@/hooks/use-safety';
import { errorMessage } from '@/lib/api';
import { validateForm } from '@/lib/form';
import { haptic } from '@/lib/haptics';

type Reason = (typeof USER_REPORT_REASONS)[number];

/** Figma 08 / Safety / Report or Block — modal. */
export default function ReportUserScreen() {
  const { t } = useTranslation();
  const { userId, name } = useLocalSearchParams<{ userId: string; name?: string }>();
  const report = useReportUser(userId);
  const block = useBlockUser();
  const [reason, setReason] = useState<Reason>('spam');
  const [details, setDetails] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    const { data, errors: invalid } = validateForm(userReportInputSchema, { reason, details });
    setErrors(invalid ?? {});
    setFormError(null);
    if (!data) return;
    try {
      await report.mutateAsync(data);
      setSent(true);
    } catch (e) {
      setFormError(errorMessage(e));
    }
  }

  function confirmBlock() {
    haptic('warning');
    Alert.alert(t('safety.blockTitle'), t('safety.blockBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('safety.block'),
        style: 'destructive',
        onPress: async () => {
          try {
            await block.mutateAsync(userId);
            // The profile is now hidden (404): leave both the modal and the profile.
            router.dismissAll();
          } catch (e) {
            setFormError(errorMessage(e));
          }
        },
      },
    ]);
  }

  return (
    <Screen underHeader title={t('safety.title')} subtitle={t('safety.subtitle')}>
      <FormError message={formError} />
      <ThemedView type="surface" style={styles.card}>
        <ThemedText type="label">{name}</ThemedText>
        <ThemedText type="caption" themeColor="muted">
          {t('safety.selectedUser')}
        </ThemedText>
      </ThemedView>

      {sent ? (
        <ThemedView type="soft" style={styles.card} accessibilityLiveRegion="polite">
          <ThemedText type="heading">{t('safety.thanksTitle')}</ThemedText>
          <ThemedText themeColor="muted">{t('safety.thanksBody')}</ThemedText>
        </ThemedView>
      ) : (
        <>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {USER_REPORT_REASONS.map((r) => (
              <Chip key={r} role="radio" label={t(`safety.reasons.${r}`)} selected={reason === r} onPress={() => setReason(r)} />
            ))}
          </View>
          <TextField
            label={t('safety.what')}
            placeholder={t('safety.whatPlaceholder')}
            value={details}
            onChangeText={setDetails}
            error={errors.details}
            multiline
            maxLength={1000}
          />
          <ThemedView type="soft" style={styles.card}>
            <ThemedText type="label">{t('safety.privateTitle')}</ThemedText>
            <ThemedText themeColor="muted">{t('safety.privateBody')}</ThemedText>
          </ThemedView>
          <Button label={t('safety.send')} loading={report.isPending} onPress={submit} />
        </>
      )}
      <Button label={t('safety.block')} variant="secondary" loading={block.isPending} onPress={confirmBlock} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius[16], gap: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
