import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

import { ApiRequestError } from './api';

/**
 * Server-state cache for the whole app.
 *
 * Why TanStack Query: caching, deduplication and background refresh come for free, and the
 * cached data keeps screens usable while offline ("Offline State" in Figma).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Parks and profiles change rarely; avoid refetching on every screen visit.
      staleTime: 60_000,
      // Keep data around for offline use (30 min after the last screen stops using it).
      gcTime: 30 * 60_000,
      // 4xx answers are final (bad input, not found, signed out) — retrying cannot help.
      retry: (failureCount, error) =>
        !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500) && failureCount < 2,
    },
  },
});

/** Pause queries while offline and refetch when the connection returns. */
onlineManager.setEventListener((setOnline) => {
  const subscription = Network.addNetworkStateListener((state) => setOnline(state.isConnected !== false));
  return () => subscription.remove();
});

/** Treat "app came back to the foreground" as window focus, so stale data refreshes. */
AppState.addEventListener('change', (status) => {
  focusManager.setFocused(status === 'active');
});
