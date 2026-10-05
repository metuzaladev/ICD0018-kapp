import { MESSAGE_MAX, messageInputSchema, type Message } from '@kapp/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { OfflineBanner } from '@/components/offline-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useConversation, useMarkConversationRead, useMessages, useSendMessage } from '@/hooks/use-messages';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { validateForm } from '@/lib/form';
import { formatMessageTime, personTitle } from '@/lib/format';

/**
 * Figma 05 / Messages / Conversation. New messages arrive over the socket (or by polling every
 * 15 s while it is down); older ones load when scrolling up. The list is inverted, so the newest
 * message sits at the bottom next to the composer and the first page needs no scrolling.
 */
export default function ConversationScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const conversation = useConversation(conversationId);
  const messages = useMessages(conversationId);
  const send = useSendMessage(conversationId);
  const markRead = useMarkConversationRead(conversationId);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const list: Message[] = messages.data?.pages.flatMap((p) => p.messages) ?? [];
  const other = conversation.data?.other;
  const newestId = list[0]?.id;
  const { mutate: markReadNow } = markRead;

  // Opening the conversation and every newly arrived message mark it read.
  useEffect(() => {
    if (newestId) markReadNow();
  }, [newestId, markReadNow]);

  async function submit() {
    const { data, errors } = validateForm(messageInputSchema, { body: draft });
    if (!data) return setError(errors.body ?? null);
    setError(null);
    try {
      await send.mutateAsync(data.body);
      setDraft('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const canMessage = conversation.data?.canMessage ?? true;

  return (
    <>
      <Stack.Screen options={{ title: other ? personTitle(other.firstName, other.dogNames) : '' }} />
      <ThemedView style={styles.root}>
        <SafeAreaView edges={['bottom']} style={styles.root}>
          <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
            <OfflineBanner />
            {messages.error && !messages.data ? <FormError message={errorMessage(messages.error)} /> : null}
            <FlatList
              inverted
              data={list}
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.list}
              onEndReached={() => messages.hasNextPage && !messages.isFetchingNextPage && messages.fetchNextPage()}
              onEndReachedThreshold={0.3}
              ListFooterComponent={messages.isFetchingNextPage ? <ActivityIndicator /> : null}
              ListEmptyComponent={
                messages.isPending ? null : (
                  <ThemedText themeColor="muted" style={styles.empty}>
                    {t('conversation.empty')}
                  </ThemedText>
                )
              }
              renderItem={({ item }) => {
                const mine = item.senderId !== other?.id;
                const who = mine ? t('common.you') : (other?.firstName ?? '');
                return (
                  <View
                    style={[styles.bubble, mine ? styles.mine : styles.theirs, { backgroundColor: mine ? c.brand : c.surface, borderColor: c.border }]}
                    accessible
                    accessibilityLabel={t('conversation.a11y', { who, time: formatMessageTime(item.createdAt), text: item.body })}>
                    <ThemedText type="caption" style={{ color: mine ? c.onBrand : c.muted }}>
                      {`${who} · ${formatMessageTime(item.createdAt)}`}
                    </ThemedText>
                    <ThemedText style={{ color: mine ? c.onBrand : c.text }}>{item.body}</ThemedText>
                  </View>
                );
              }}
            />
            <FormError message={error} />
            {canMessage ? (
              <View style={[styles.composer, { borderTopColor: c.border }]}>
                <TextInput
                  accessibilityLabel={t('conversation.message')}
                  placeholder={t('conversation.placeholder')}
                  placeholderTextColor={c.muted}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={MESSAGE_MAX}
                  style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }]}
                />
                <View style={styles.send}>
                  <Button label={t('conversation.send')} loading={send.isPending} disabled={draft.trim().length === 0} onPress={submit} />
                </View>
              </View>
            ) : (
              <ThemedText themeColor="muted" style={styles.notice}>
                {t('conversation.notFriends')}
              </ThemedText>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two },
  empty: { textAlign: 'center', padding: Spacing.four, transform: [{ scaleY: -1 }] },
  bubble: { maxWidth: '80%', padding: Spacing.three, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, gap: 2 },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, padding: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  input: { ...Type.body, flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: Radius[16], paddingHorizontal: Spacing.three, paddingVertical: 10 },
  // Grows with the label ("Отправить" is longer than "Saada") instead of wrapping mid-word.
  send: { minWidth: 96, flexShrink: 0 },
  notice: { padding: Spacing.three, textAlign: 'center' },
});
