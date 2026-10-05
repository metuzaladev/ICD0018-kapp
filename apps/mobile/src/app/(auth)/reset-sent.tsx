import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';

/** Figma 01 / Reset sent. Wording does not confirm that the address exists. */
export default function ResetSentScreen() {
  const { t } = useTranslation();
  return (
    <Screen underHeader title={t('auth.resetSent.title')} subtitle={t('auth.resetSent.subtitle')}>
      <Button label={t('auth.backToSignIn')} onPress={() => router.dismissTo('/sign-in')} />
    </Screen>
  );
}
