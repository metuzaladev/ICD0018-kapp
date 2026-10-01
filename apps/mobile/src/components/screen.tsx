import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** Screen scaffold matching the Figma "Screen Header": large title, subtitle, scrollable stack. */
export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <ThemedView style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.root}>
        <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
          <ThemedText type="title">{title}</ThemedText>
          {subtitle ? <ThemedText themeColor="muted">{subtitle}</ThemedText> : null}
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: Spacing.screen, gap: Spacing.three, paddingBottom: Spacing.six * 2 },
});
