import { useSyncExternalStore } from 'react';

/**
 * A one-time message shown on the signed-out screens after the session ended on purpose (M10:
 * "Sinu konto on kustutatud"). The root layout swaps to Welcome by itself when the session goes
 * away, so the screen that ended it cannot show the confirmation; it leaves a notice here instead.
 * In memory only: after an app restart there is nothing to confirm any more.
 */
export type SessionNotice = 'account-deleted';

let current: SessionNotice | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const sessionNotice = {
  set(notice: SessionNotice) {
    current = notice;
    emit();
  },
  clear() {
    current = null;
    emit();
  },
  get: () => current,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useSessionNotice(): SessionNotice | null {
  return useSyncExternalStore(sessionNotice.subscribe, sessionNotice.get, sessionNotice.get);
}
