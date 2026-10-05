import type { Conversation } from '@kapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { ListRow } from '@/components/list-row';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useConversations } from '@/hooks/use-messages';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { formatMessageTime, personTitle } from '@/lib/format';

/** Figma 05 / Messages / Inbox. The search filters loaded conversations by the friend's or dog's name. */
export default function InboxScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const conversations = useConversations();
  const { data, error } = conversations;
  const refresh = usePullToRefresh(conversations.refetch);
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLocaleLowerCase();
  // `other` is null when the friend deleted their account (M10): listed as "Kustutatud kasutaja".
  const nameOf = (conv: Conversation) => (conv.other ? personTitle(conv.other.firstName, conv.other.dogNames) : t('conversation.deletedUser'));
  const shown = (data ?? []).filter(
    (conv) =>
      !needle ||
      (conv.other ? [conv.other.firstName, ...conv.other.dogNames] : [t('conversation.deletedUser')]).some((n) => n.toLocaleLowerCase().includes(needle)),
  );

  return (
    <Screen underHeader title={t('inbox.title')} subtitle={t('inbox.subtitle')} refresh={refresh}>
      <OfflineBanner />
      {error && !data ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void conversations.refetch()} retrying={conversations.isFetching} />
      ) : null}
      {conversations.isPending ? <SkeletonList /> : null}
      {data && data.length > 0 ? (
        <TextField label={t('inbox.search')} placeholder={t('inbox.searchPlaceholder')} value={filter} onChangeText={setFilter} maxLength={50} />
      ) : null}
      {data?.length === 0 ? (
        <EmptyState title={t('inbox.empty')} actionLabel={t('inbox.emptyAction')} onAction={() => router.push('/friends')} />
      ) : null}
      {shown.map((conv, i) => {
        const last = conv.lastMessage;
        const subtitle = last ? `${last.body} · ${formatMessageTime(last.createdAt)}` : t('inbox.noMessages');
        return (
          <Entering key={conv.id} index={i}>
            <ListRow
              photo={{ name: conv.other ? (conv.other.dogNames[0] ?? conv.other.firstName) : null }}
              title={nameOf(conv)}
              subtitle={subtitle}
              accessibilityHint={conv.unreadCount > 0 ? t('inbox.unread', { count: conv.unreadCount }) : undefined}
              leading={
                conv.unreadCount > 0 ? (
                  <View style={[styles.badge, { backgroundColor: c.brand }]} accessibilityElementsHidden>
                    <ThemedText type="micro" style={{ color: c.onBrand }}>
                      {String(conv.unreadCount)}
                    </ThemedText>
                  </View>
                ) : null
              }
              onPress={() => router.push({ pathname: '/messages/[conversationId]', params: { conversationId: conv.id } })}
            />
          </Entering>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { minWidth: 24, minHeight: 24, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.one },
});
