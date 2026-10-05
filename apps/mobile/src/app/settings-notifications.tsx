import type { NotificationPreferences } from '@kapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { PushPrompt } from '@/components/push-prompt';
import { Screen } from '@/components/screen';
import { SwitchRow } from '@/components/switch-row';
import { ThemedText } from '@/components/themed-text';
import { useNotificationPreferences, useSaveNotificationPreferences } from '@/hooks/use-notifications';
import { errorMessage } from '@/lib/api';

const KEYS: (keyof NotificationPreferences)[] = ['messages', 'friendPlans', 'friendRequests'];

/** Figma 07 / Settings / Notifications: which pushes to receive. The in-app feed always shows everything. */
export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const saved = useNotificationPreferences();
  const save = useSaveNotificationPreferences();
  // Local edits on top of the saved values; nothing is sent until "Salvesta eelistused".
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const values = draft ?? saved.data ?? null;

  async function submit() {
    if (!values) return;
    try {
      await save.mutateAsync(values);
      router.back();
    } catch {
      // Shown below from save.error.
    }
  }

  return (
    <Screen underHeader title={t('notificationSettings.title')} subtitle={t('notificationSettings.subtitle')}>
      <PushPrompt always />
      {saved.error ? <FormError message={errorMessage(saved.error)} /> : null}
      {save.error ? <FormError message={errorMessage(save.error)} /> : null}
      {KEYS.map((key) => (
        <SwitchRow
          key={key}
          label={t(`notificationSettings.${key}`)}
          value={values?.[key] ?? true}
          disabled={!values}
          onValueChange={(on) => values && setDraft({ ...values, [key]: on })}
        />
      ))}
      <ThemedText type="caption" themeColor="muted">
        {t('notificationSettings.feedNote')}
      </ThemedText>
      <Button label={t('notificationSettings.save')} loading={save.isPending} disabled={!values} onPress={submit} />
    </Screen>
  );
}
