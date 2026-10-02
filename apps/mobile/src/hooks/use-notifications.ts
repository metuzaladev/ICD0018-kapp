import type { NotificationPage, NotificationPreferences, UnreadCount } from '@kapp/shared';
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

export function useNotificationFeed() {
  return useInfiniteQuery({
    queryKey: notificationKeys.feed,
    queryFn: ({ pageParam }) => apiGet<NotificationPage>('/me/notifications', pageParam ? { before: pageParam } : undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** The tab badge: pushed live over the socket, polled once a minute while it is down. */
export function useUnreadCount() {
  const live = useRealtimeConnected();
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => apiGet<UnreadCount>('/me/notifications/unread-count'),
    refetchInterval: live ? false : 60_000,
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
  return useQuery({ queryKey: notificationKeys.preferences, queryFn: () => apiGet<NotificationPreferences>('/me/notification-preferences') });
}

export function useSaveNotificationPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (preferences: NotificationPreferences) => apiSend<NotificationPreferences>('PUT', '/me/notification-preferences', preferences),
    onSuccess: (saved) => client.setQueryData(notificationKeys.preferences, saved),
  });
}
