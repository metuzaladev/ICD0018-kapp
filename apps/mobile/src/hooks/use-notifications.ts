import type { AnyNotificationPage, NotificationPreferencesInput, NotificationPreferencesWithRewards, UnreadCount } from '@kapp/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/lib/api';
import { useRealtimeConnected } from '@/lib/realtime';

/** Activity feed, unread badge and push preferences (Notifications / Activity, Settings / Notifications). */
export const notificationKeys = {
  all: ['notifications'] as const,
  feed: ['notifications', 'feed'] as const,
  unread: ['notifications', 'unread'] as const,
  preferences: ['notification-preferences'] as const,
};

/**
 * `include=rewards` (M9b) adds reward_level_up, reward_badge and place_post_approved rows; the API
 * leaves them out for older app builds that cannot render them (docs/16). They have no realtime
 * event, so they appear on the next refetch (focus, pull to refresh, the unread poll).
 */
const INCLUDE = { include: 'rewards' } as const;

export function useNotificationFeed() {
  return useInfiniteQuery({
    queryKey: notificationKeys.feed,
    queryFn: ({ pageParam }) => apiGet<AnyNotificationPage>('/me/notifications', pageParam ? { ...INCLUDE, before: pageParam } : INCLUDE),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** The tab badge: pushed live over the socket, polled once a minute while it is down. */
export function useUnreadCount() {
  const live = useRealtimeConnected();
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => apiGet<UnreadCount>('/me/notifications/unread-count', INCLUDE),
    // Reward rows are not pushed over the socket, so poll slowly even while it is connected.
    refetchInterval: live ? 5 * 60_000 : 60_000,
  });
}

export function useMarkNotificationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<void>('PUT', `/me/notifications/${id}/read`),
    onSuccess: () => client.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<void>('PUT', '/me/notifications/read-all'),
    onSuccess: () => client.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useNotificationPreferences() {
  return useQuery({ queryKey: notificationKeys.preferences, queryFn: () => apiGet<NotificationPreferencesWithRewards>('/me/notification-preferences') });
}

export function useSaveNotificationPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (preferences: NotificationPreferencesInput) => apiSend<NotificationPreferencesWithRewards>('PUT', '/me/notification-preferences', preferences),
    onSuccess: (saved) => client.setQueryData(notificationKeys.preferences, saved),
  });
}
