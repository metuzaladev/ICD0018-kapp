import { inlineText, type LegalBlock, type LegalInline } from '@kapp/shared';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The privacy policy / terms rendered natively from the shared Markdown blocks (M10, docs/17) —
 * the same source as the public web page, so the app and the store URL always say the same thing.
 * Headings are VoiceOver headers; a list item is read as one element; links open the browser/mail.
 */
function Inline({ content }: { content: LegalInline[] }) {
  const c = useTheme();
  return content.map((part, i) => {
    const style = part.bold ? styles.bold : undefined;
    if (part.href) {
      const href = part.href;
      return (
        <Text
          key={i}
          style={[style, { color: c.link, textDecorationLine: 'underline' }]}
          accessibilityRole="link"
          accessibilityLabel={part.text}
          onPress={() => void Linking.openURL(href)}>
          {part.text}
        </Text>
      );
    }
    return (
      <Text key={i} style={style}>
        {part.text}
      </Text>
    );
  });
}

export function LegalDocumentView({ blocks }: { blocks: LegalBlock[] }) {
  const c = useTheme();
  return (
    <View style={styles.root}>
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return (
            <ThemedText key={i} type={block.level === 1 ? 'title' : 'heading'} accessibilityRole="header" style={i > 0 && styles.headingGap}>
              <Inline content={block.content} />
            </ThemedText>
          );
        }
        if (block.type === 'paragraph') {
          return (
            <ThemedText key={i}>
              <Inline content={block.content} />
            </ThemedText>
          );
        }
        return (
          <View key={i} style={styles.list}>
            {block.items.map((item, j) => (
              // One VoiceOver element per item, unless it holds a link that must stay activatable.
              <View key={j} style={styles.item} accessible={!item.some((p) => p.href)} accessibilityLabel={inlineText(item)}>
                <ThemedText style={{ color: c.muted }} importantForAccessibility="no">
                  •
                </ThemedText>
                <ThemedText style={styles.itemText}>
                  <Inline content={item} />
                </ThemedText>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.three },
  headingGap: { marginTop: Spacing.two },
  bold: { fontWeight: '700' },
  list: { gap: Spacing.two },
  item: { flexDirection: 'row', gap: Spacing.two },
  itemText: { flex: 1 },
});
