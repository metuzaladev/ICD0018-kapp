import { useNetworkState } from 'expo-network';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';

/** Figma "Offline State", compact: the cached data stays visible underneath. */
export function OfflineBanner() {
  const network = useNetworkState();
  // `undefined` while unknown at startup — do not flash the banner.
  if (network.isConnected !== false) return null;
  return (
    <ThemedView type="tint" style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <ThemedText type="label">Internetiühendus puudub</ThemedText>
      <ThemedText type="caption">Näitan viimati laaditud andmeid. Uuendan, kui ühendus taastub.</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  banner: { padding: Spacing.three, borderRadius: Radius[12], gap: 2 },
});
