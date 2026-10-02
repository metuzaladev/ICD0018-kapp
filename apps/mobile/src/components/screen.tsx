import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PawBackground } from '@/components/paw-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  /** Set when a native stack header already covers the top safe area. */
  underHeader?: boolean;
  /**
   * Pull to refresh (from hooks/use-pull-to-refresh.ts). Only on screens whose data can change
   * while they are open (lists of parks, visits, bookings …), not on forms.
   */
  refresh?: { refreshing: boolean; onRefresh: () => void };
};

/** Screen scaffold matching the Figma "Screen Header": title, subtitle, scrollable stack. */
export function Screen({ title, subtitle, children, underHeader = false, refresh }: ScreenProps) {
  const c = useTheme();
  return (
    <ThemedView style={styles.root}>
      <PawBackground />
      <SafeAreaView edges={underHeader ? [] : ['top']} style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          // Forms: tapping a button while the keyboard is open must press it, not just close the keyboard.
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          refreshControl={
            refresh ? <RefreshControl refreshing={refresh.refreshing} onRefresh={refresh.onRefresh} tintColor={c.brand} colors={[c.brand]} /> : undefined
          }>
          {title ? (
            <ThemedText type="title" accessibilityRole="header">
              {title}
            </ThemedText>
          ) : null}
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
