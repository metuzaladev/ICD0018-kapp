import type { AppNotification } from '@kapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { ListRow } from '@/components/list-row';
import { OfflineBanner } from '@/components/offline-banner';
import { PushPrompt } from '@/components/push-prompt';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { Radius, Spacing } from '@/constants/theme';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotificationFeed, useUnreadCount } from '@/hooks/use-notifications';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { formatDay, formatMessageTime, formatTime } from '@/lib/format';

type Filter = 'all' | 'friends' | 'messages';
const FILTERS: Filter[] = ['all', 'friends', 'messages'];
const FRIEND_TYPES: AppNotification['type'][] = ['friend_request', 'friend_accepted', 'friend_plan'];
/** Booking rows (M6) only show under "Kõik": they are neither friends nor messages. */
const matches = (n: AppNotification, filter: Filter) =>
  filter === 'all' || (filter === 'messages' ? n.type === 'message' : FRIEND_TYPES.includes(n.type));

/** Figma 06 / Notifications / Activity: the feed, rendered in the app's language from type + data. */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const feed = useNotificationFeed();
  const unread = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [filter, setFilter] = useState<Filter>('all');
  const items = (feed.data?.pages.flatMap((p) => p.items) ?? []).filter((n) => matches(n, filter));
  const refresh = usePullToRefresh(feed.refetch, unread.refetch);

  function text(n: AppNotification): { title: string; subtitle: string } {
    const name = n.actor?.firstName ?? t('notifications.someone');
    const when = formatMessageTime(n.createdAt);
    switch (n.type) {
      case 'friend_request':
        return { title: t('notifications.friendRequest'), subtitle: `${t('notifications.friendRequestBody', { name })} · ${when}` };
      case 'friend_accepted':
        return { title: t('notifications.friendAccepted', { name }), subtitle: when };
      case 'message':
        return { title: t('notifications.message', { name }), subtitle: `${n.data.preview ?? ''} · ${when}` };
      case 'friend_plan':
        return {
          title: t('notifications.friendPlan', { name }),
          subtitle:
            n.data.startsAt && n.data.endsAt
              ? `${n.data.parkName ?? ''} · ${formatDay(n.data.startsAt)} ${formatTime(n.data.startsAt)}–${formatTime(n.data.endsAt)}`
              : (n.data.parkName ?? ''),
        };
      case 'booking_confirmed':
      case 'booking_cancelled':
      case 'booking_reminder': {
        const titleKey =
          n.type === 'booking_confirmed'
            ? 'notifications.bookingConfirmed'
            : n.type === 'booking_cancelled'
              ? 'notifications.bookingCancelled'
              : 'notifications.bookingReminder';
        return {
          title: t(titleKey),
          subtitle: t('notifications.bookingBody', {
            service: n.data.serviceName ?? '',
            provider: n.data.providerName ?? '',
            when: n.data.startsAt ? `${formatDay(n.data.startsAt)} ${formatTime(n.data.startsAt)}` : '',
          }),
        };
      }
    }
  }

  function open(n: AppNotification) {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.data.bookingId) {
      router.push('/bookings');
    } else if (n.type === 'message' && n.data.conversationId) {
      router.push({ pathname: '/messages/[conversationId]', params: { conversationId: n.data.conversationId } });
    } else if (n.type === 'friend_request') {
      router.push('/friends');
    } else if (n.type === 'friend_plan' && n.data.parkId) {
      router.push({ pathname: '/parks/[parkId]', params: { parkId: n.data.parkId } });
    } else if (n.actor) {
      router.push({ pathname: '/users/[userId]', params: { userId: n.actor.id } });
    }
  }

  return (
    <Screen title={t('notifications.title')} subtitle={t('notifications.subtitle')} refresh={refresh}>
      <OfflineBanner />
      <PushPrompt />
      <View style={styles.chips}>
        {FILTERS.map((f) => (
          <Chip key={f} label={t(`notifications.filters.${f}`)} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>
      {(unread.data?.count ?? 0) > 0 ? (
        <Button label={t('notifications.markAll')} variant="tertiary" loading={markAll.isPending} onPress={() => markAll.mutate()} />
      ) : null}
      {feed.error && !feed.data ? <ErrorState message={errorMessage(feed.error)} onRetry={() => void feed.refetch()} retrying={feed.isFetching} /> : null}
      {feed.isPending ? <SkeletonList /> : null}
      {feed.data && items.length === 0 ? <EmptyState title={t('notifications.body')} /> : null}
      {items.map((n, i) => {
        const { title, subtitle } = text(n);
        return (
          <Entering key={n.id} index={i}>
            <ListRow
              title={title}
              subtitle={subtitle}
              accessibilityHint={n.readAt ? undefined : t('notifications.unreadHint')}
              leading={<View style={[styles.dot, { backgroundColor: n.readAt ? 'transparent' : c.brand }]} accessibilityElementsHidden />}
              onPress={() => open(n)}
            />
          </Entering>
        );
      })}
      {feed.hasNextPage ? (
        <Button label={t('notifications.more')} variant="secondary" loading={feed.isFetchingNextPage} onPress={() => feed.fetchNextPage()} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  dot: { width: 10, height: 10, borderRadius: Radius.full },
});
