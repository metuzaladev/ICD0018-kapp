import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';

/** Form-level error (e.g. "Vale e-post või parool"). Announced to VoiceOver when it appears. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <ThemedView type="dangerSoft" style={styles.box} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <ThemedText type="label" themeColor="text">
        {message}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { padding: Spacing.three, borderRadius: Radius[12] },
});
