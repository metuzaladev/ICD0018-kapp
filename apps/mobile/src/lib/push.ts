import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import i18n, { currentLanguage } from '@/i18n';

import { apiSend } from './api';

/**
 * Push notifications on the device (docs/12-kogukond.md).
 *
 * - The system permission dialog is shown only after our own explanation (components/push-prompt),
 *   because iOS asks only once: a "no" before the user knows why is hard to undo.
 * - The Expo push token is registered with the app language, so the server writes pushes in it.
 * - Needs a development build with expo-notifications (native module) and an EAS project id
 *   (`eas init` → app.json extra.eas.projectId). Remote push does not work in the iOS simulator.
 */

const DISMISSED_KEY = 'kapp.pushPromptDismissed';
let registeredToken: string | null = null;

/** Foreground pushes are shown as banners (a message from a friend while browsing the map). */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export async function getPushPermission(): Promise<PushPermission> {
  if (!Device.isDevice && Platform.OS === 'ios') return 'unavailable';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'unavailable';
  }
}

/** Shows the system dialog (call only from the explanation's button) and registers on "allow". */
export async function requestPushPermission(): Promise<PushPermission> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status === 'granted') await registerPushToken();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

export async function isPushPromptDismissed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DISMISSED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function dismissPushPrompt(): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Shown again next time; harmless.
  }
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Gets the Expo push token and sends it (with the app language) to the API. Safe to call often:
 * on start, after the permission is granted and whenever the language changes.
 */
export async function registerPushToken(): Promise<void> {
  if ((await getPushPermission()) !== 'granted') return;
  const id = projectId();
  if (!id) {
    if (__DEV__) console.warn('Push: no EAS projectId in app.json (run `eas init`); skipping token registration');
    return;
  }
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: i18n.t('push.channelName'),
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await apiSend<void>('PUT', '/me/push-tokens', { token, platform: Platform.OS === 'ios' ? 'ios' : 'android', language: currentLanguage() });
    registeredToken = token;
  } catch (e) {
    if (__DEV__) console.warn('Push token registration failed', e);
  }
}

/** On sign-out: this device must stop receiving the previous account's pushes. Best effort. */
export async function unregisterPushToken(): Promise<void> {
  if (!registeredToken) return;
  try {
    await apiSend<void>('DELETE', `/me/push-tokens/${encodeURIComponent(registeredToken)}`);
  } catch {
    // The server also drops tokens Expo reports as unregistered.
  }
  registeredToken = null;
}
