import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Figma "Info Card" (4:36): soft accent card, heading + muted body ("Ausus ennekõike",
 * "Teenid 15 käppa"). One VoiceOver element; optional trailing content (a button) stays separate.
 */
export function InfoCard({ title, body, children }: { title: string; body?: string | null; children?: ReactNode }) {
  const c = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.soft }]}>
      <View accessible style={styles.text}>
        <ThemedText type="heading">{title}</ThemedText>
        {body ? <ThemedText themeColor="muted">{body}</ThemedText> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, borderRadius: Radius[16], gap: Spacing.three },
  text: { gap: Spacing.two },
});
