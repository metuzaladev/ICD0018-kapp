import { REALTIME_PATH, type AppNotification, type Message, type RealtimeEvents } from '@kapp/shared';
import { io, type Socket } from 'socket.io-client';
import { useSyncExternalStore } from 'react';

import { authClient } from './auth-client';
import { API_ORIGIN } from './config';

/**
 * The app's single Socket.IO connection (docs/12-kogukond.md). Server → client only: new messages
 * and notifications. Everything else (sending, marking read) goes through the REST API.
 *
 * When the socket is down the screens fall back to polling (TanStack Query `refetchInterval`,
 * 15 s on an open conversation), so a broken realtime link only makes updates slower, never lost.
 */

type Listener = {
  onMessage: (message: Message) => void;
  onNotification: (payload: { notification: AppNotification; unreadCount: number }) => void;
};

let socket: Socket<RealtimeEvents> | null = null;
let connected = false;
const statusListeners = new Set<() => void>();

function setConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  statusListeners.forEach((l) => l());
}

/** Connects with the Better Auth session cookie (header and handshake payload, see the API gateway). */
export async function connectRealtime(listener: Listener): Promise<void> {
  disconnectRealtime();
  let cookie = '';
  try {
    cookie = (await authClient.getCookie()) ?? '';
  } catch {
    // No cookie readable: stay on polling.
    return;
  }
  if (!cookie) return;
  const s: Socket<RealtimeEvents> = io(API_ORIGIN, {
    path: REALTIME_PATH,
    // React Native: WebSocket transport directly (long-polling would need a cookie jar).
    transports: ['websocket'],
    extraHeaders: { cookie },
    auth: { cookie },
    reconnectionDelayMax: 30_000,
  });
  s.on('connect', () => setConnected(true));
  s.on('disconnect', () => setConnected(false));
  s.on('connect_error', () => setConnected(false));
  s.on('message:new', listener.onMessage);
  s.on('notification:new', listener.onNotification);
  socket = s;
}

export function disconnectRealtime() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  setConnected(false);
}

/** Whether live updates are flowing; screens poll while this is false. */
export function useRealtimeConnected(): boolean {
  return useSyncExternalStore(
    (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    () => connected,
  );
}
