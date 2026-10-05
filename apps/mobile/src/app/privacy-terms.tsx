import { LEGAL_VERSIONS } from '@kapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useExportData } from '@/hooks/use-account';
import { errorMessage } from '@/lib/api';
import { haptic } from '@/lib/haptics';

/**
 * Settings → "Privaatsus ja tingimused" (M10, docs/17): the two documents and "Laadi minu andmed
 * alla" (GDPR art. 15/20). The export goes through the system share sheet (save to Files, mail it to
 * yourself …), which needs no extra native module; the JSON is never stored by the app.
 */
export default function PrivacyTermsScreen() {
  const { t } = useTranslation();
  const exportData = useExportData();
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setError(null);
    try {
      const data = await exportData.mutateAsync();
      await Share.share({ title: t('legal.exportShareTitle'), message: JSON.stringify(data, null, 2) });
    } catch (e) {
      haptic('error');
      setError(errorMessage(e));
    }
  }

  return (
    <Screen underHeader title={t('legal.title')} subtitle={t('legal.subtitle')}>
      <ListRow
        icon="shield"
        title={t('legal.privacy')}
        subtitle={t('legal.version', { version: LEGAL_VERSIONS.privacy })}
        accessibilityHint={t('legal.openHint')}
        onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}
      />
      <ListRow
        icon="info"
        title={t('legal.terms')}
        subtitle={t('legal.version', { version: LEGAL_VERSIONS.terms })}
        accessibilityHint={t('legal.openHint')}
        onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
      />

      <ThemedText type="heading" accessibilityRole="header">
        {t('legal.yourData')}
      </ThemedText>
      <ThemedText themeColor="muted">{t('legal.exportSub')}</ThemedText>
      <FormError message={error} />
      <Button label={t('legal.export')} variant="secondary" loading={exportData.isPending} onPress={download} />
      <ThemedText type="caption" themeColor="muted">
        {t('legal.deleteHint')}
      </ThemedText>
    </Screen>
  );
}
