import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { dismissPushPrompt, getPushPermission, isPushPromptDismissed, requestPushPermission, type PushPermission } from '@/lib/push';

/**
 * Explains push notifications BEFORE the system dialog (iOS asks only once). Shown while the
 * permission is undetermined and the user has not chosen "Mitte praegu"; `always` (Settings /
 * Notifications) ignores the dismissal and also offers the system settings after a "no".
 */
export function PushPrompt({ always = false }: { always?: boolean }) {
  const { t } = useTranslation();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getPushPermission(), isPushPromptDismissed()]).then(([p, d]) => {
        if (!active) return;
        setPermission(p);
        setDismissed(d);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  if (permission === null || permission === 'granted' || permission === 'unavailable') return null;
  if (permission === 'undetermined' && dismissed && !always) return null;
  if (permission === 'denied' && !always) return null;

  async function allow() {
    setBusy(true);
    try {
      setPermission(await requestPushPermission());
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView type="soft" style={styles.card} accessibilityRole="summary">
      <ThemedText type="heading">{t('pushPrompt.title')}</ThemedText>
      <ThemedText themeColor="muted">{permission === 'denied' ? t('pushPrompt.deniedBody') : t('pushPrompt.body')}</ThemedText>
      {permission === 'denied' ? (
        <Button label={t('common.openSettings')} variant="secondary" onPress={() => Linking.openSettings()} />
      ) : (
        <>
          <Button label={t('pushPrompt.allow')} loading={busy} onPress={allow} />
          {!always ? (
            <Button
              label={t('pushPrompt.notNow')}
              variant="tertiary"
              onPress={() => {
                setDismissed(true);
                void dismissPushPrompt();
              }}
            />
          ) : null}
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.four, borderRadius: Radius[16], gap: Spacing.two },
});
