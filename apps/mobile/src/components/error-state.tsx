import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';

type ErrorStateProps = {
  message: string;
  /** Usually the query's `refetch`; the button shows a spinner while it runs. */
  onRetry: () => void;
  retrying?: boolean;
};

/**
 * A screen's data could not be loaded and nothing is cached: the server's message (already in the
 * user's language) and "Proovi uuesti" (Figma "Offline State"). Announced to VoiceOver as an alert.
 * When cached data exists, screens keep showing it and use FormError instead.
 */
export function ErrorState({ message, onRetry, retrying = false }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <ThemedView type="dangerSoft" style={styles.box}>
      <ThemedText type="label" accessibilityRole="alert" accessibilityLiveRegion="assertive">
        {message}
      </ThemedText>
      <Button label={t('common.retry')} variant="secondary" loading={retrying} onPress={onRetry} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { padding: Spacing.three, borderRadius: Radius[12], gap: Spacing.three },
});
