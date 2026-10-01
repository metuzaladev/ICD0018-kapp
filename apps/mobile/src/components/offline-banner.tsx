import { useNetworkState } from 'expo-network';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';

/** Figma "Offline State", compact: the cached data stays visible underneath. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const network = useNetworkState();
  // `undefined` while unknown at startup — do not flash the banner.
  if (network.isConnected !== false) return null;
  return (
    <ThemedView type="tint" style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <ThemedText type="label">{t('offline.title')}</ThemedText>
      <ThemedText type="caption">{t('offline.body')}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  banner: { padding: Spacing.three, borderRadius: Radius[12], gap: 2 },
});
