import { PermissionStatus } from 'expo-location';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';

type LocationPromptProps = {
  status: PermissionStatus;
  canAskAgain: boolean;
  onRequest: () => void;
};

/**
 * Figma "Permissions / Location" as an inline card. Explaining *before* the system dialog is an
 * HIG recommendation and raises acceptance; iOS only lets an app show that dialog once.
 */
export function LocationPrompt({ status, canAskAgain, onRequest }: LocationPromptProps) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  if (status === PermissionStatus.GRANTED || dismissed) return null;

  const denied = status === PermissionStatus.DENIED;
  return (
    <ThemedView type="soft" style={styles.card}>
      <ThemedText type="heading">{denied ? t('location.deniedTitle') : t('location.title')}</ThemedText>
      <ThemedText themeColor="muted">{denied ? t('location.deniedBody') : t('location.body')}</ThemedText>
      {denied ? null : (
        <ThemedText type="caption" themeColor="muted">
          {t('location.privacy')}
        </ThemedText>
      )}
      <View style={styles.actions}>
        {denied && !canAskAgain ? (
          <Button label={t('common.openSettings')} onPress={() => Linking.openSettings()} />
        ) : (
          <Button label={t('location.allow')} onPress={onRequest} />
        )}
        <Button label={t('location.notNow')} variant="tertiary" onPress={() => setDismissed(true)} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.four, borderRadius: Radius[16], gap: Spacing.two },
  actions: { gap: Spacing.one, marginTop: Spacing.two },
});
