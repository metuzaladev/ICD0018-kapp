import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { currentLanguage } from '@/i18n';
import { apiSend } from '@/lib/api';
import { registerPushToken } from '@/lib/push';
import { connectRealtime, disconnectRealtime } from '@/lib/realtime';

import { addMessageToCache, conversationKeys } from './use-messages';
import { notificationKeys } from './use-notifications';

/** Where a tapped push leads, from the `data` the server put into it. */
function openFromPush(data: Record<string, unknown> | undefined) {
  if (!data) return;
  if (typeof data.postId === 'string') {
    // place_post_approved (M9b): the approved recommendation.
    router.push({ pathname: '/place-posts/[postId]', params: { postId: data.postId } });
  } else if (data.type === 'reward_level_up' || data.type === 'reward_badge') {
    router.push('/rewards');
  } else if (typeof data.bookingId === 'string') {
    router.push('/bookings');
  } else if (typeof data.conversationId === 'string') {
    router.push({ pathname: '/messages/[conversationId]', params: { conversationId: data.conversationId } });
  } else if (data.type === 'friend_request') {
    router.push('/friends');
  } else if (typeof data.userId === 'string') {
    router.push({ pathname: '/users/[userId]', params: { userId: data.userId } });
  } else {
    router.navigate('/notifications');
  }
}

/**
 * Everything community-related that runs while signed in (root layout):
 * the realtime socket feeding the query cache, push token registration, the stored language for
 * push texts, and opening the right screen when a push is tapped.
 */
export function useCommunityRuntime(signedIn: boolean) {
  const client = useQueryClient();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage;

  useEffect(() => {
    if (!signedIn) return;
    void connectRealtime({
      onMessage: (message) => {
        addMessageToCache(client, message);
        client.invalidateQueries({ queryKey: conversationKeys.list });
      },
      onNotification: () => {
        // The socket's count leaves out the M9b reward rows (they are opt-in with include=rewards),
        // so the badge is refetched with them instead of taking the pushed number.
        client.invalidateQueries({ queryKey: notificationKeys.unread });
        client.invalidateQueries({ queryKey: notificationKeys.feed });
        // A request or acceptance changes the friends lists too.
        client.invalidateQueries({ queryKey: ['friends'] });
      },
    });
    return disconnectRealtime;
  }, [signedIn, client]);

  // Push texts are composed on the server in the stored language: keep it in sync with the app.
  useEffect(() => {
    if (!signedIn) return;
    void apiSend('PATCH', '/me', { language: currentLanguage() }).catch(() => {});
    void registerPushToken();
  }, [signedIn, language]);

  useEffect(() => {
    if (!signedIn) return;
    // A push tapped while the app was closed, then every later tap.
    const last = Notifications.getLastNotificationResponse();
    if (last) openFromPush(last.notification.request.content.data);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
      openFromPush(response.notification.request.content.data),
    );
    return () => subscription.remove();
  }, [signedIn]);
}
