import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

/** Figma 06 / Notifications / Activity — the feed itself arrives with friends (M5). */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t('notifications.title')} subtitle={t('notifications.subtitle')}>
      <ThemedText themeColor="muted">{t('notifications.body')}</ThemedText>
    </Screen>
  );
}
