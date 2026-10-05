import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Entering } from '@/components/entering';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';

type EmptyStateProps = {
  title: string;
  body?: string | null;
  /** The next useful step (Figma "Empty State / Meetups": every empty state offers one). */
  actionLabel?: string;
  onAction?: () => void;
  actionHint?: string;
};

/**
 * A list with nothing in it yet: a soft card with a friendly title, one sentence and an optional
 * action, instead of a lone grey line. Title and body are one VoiceOver element; the action is
 * its own button.
 */
export function EmptyState({ title, body, actionLabel, onAction, actionHint }: EmptyStateProps) {
  return (
    <Entering>
      <ThemedView type="soft" style={styles.card}>
        <ThemedView type="soft" accessible accessibilityLabel={[title, body].filter(Boolean).join('. ')} style={styles.text}>
          <ThemedText type="label">{title}</ThemedText>
          {body ? (
            <ThemedText type="caption" themeColor="muted">
              {body}
            </ThemedText>
          ) : null}
        </ThemedView>
        {actionLabel && onAction ? (
          <Button label={actionLabel} variant="secondary" onPress={onAction} accessibilityHint={actionHint} />
        ) : null}
      </ThemedView>
    </Entering>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius[16], gap: Spacing.three },
  text: { gap: 2 },
});
