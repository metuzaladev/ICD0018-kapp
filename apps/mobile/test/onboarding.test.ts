import { describe, expect, it, vi } from 'vitest';

// The default store is created with AsyncStorage at import time; the tests use their own storage.
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }));

import { createOnboardingStore, ONBOARDING_STORAGE_KEY, type FlagStorage } from '@/lib/onboarding';

function memoryStorage(initial: string | null = null) {
  const state: { value: string | null } = { value: initial };
  return Object.assign(state, {
    getItem: vi.fn<FlagStorage['getItem']>(async () => state.value),
    setItem: vi.fn<FlagStorage['setItem']>(async (_key, value) => {
      state.value = value;
    }),
  });
}

describe('onboarding store', () => {
  it('is unknown (null) before loading', () => {
    expect(createOnboardingStore(memoryStorage()).isSeen()).toBeNull();
  });

  it('reports seen when the flag is stored', async () => {
    const store = createOnboardingStore(memoryStorage('1'));
    await expect(store.load()).resolves.toBe(true);
    expect(store.isSeen()).toBe(true);
  });

  it('reports not seen on a fresh install (null)', async () => {
    const storage = memoryStorage(null);
    const store = createOnboardingStore(storage);
    await expect(store.load()).resolves.toBe(false);
    expect(storage.getItem).toHaveBeenCalledWith(ONBOARDING_STORAGE_KEY);
  });

  it('treats an invalid stored value as not seen', async () => {
    const store = createOnboardingStore(memoryStorage('yes please'));
    await expect(store.load()).resolves.toBe(false);
  });

  it('treats unreadable storage as seen and does not reject', async () => {
    const storage = memoryStorage();
    storage.getItem.mockRejectedValue(new Error('disk full'));
    const store = createOnboardingStore(storage);
    await expect(store.load()).resolves.toBe(true);
    expect(store.isSeen()).toBe(true);
  });

  it('persists markSeen and notifies subscribers', async () => {
    const storage = memoryStorage();
    const store = createOnboardingStore(storage);
    await store.load();
    const listener = vi.fn();
    store.subscribe(listener);
    await store.markSeen();
    expect(store.isSeen()).toBe(true);
    expect(listener).toHaveBeenCalled();
    expect(storage.value).toBe('1');
    // The next app start reads it back.
    await expect(createOnboardingStore(storage).load()).resolves.toBe(true);
  });

  it('applies markSeen for the session even when saving fails', async () => {
    const storage = memoryStorage();
    storage.setItem.mockRejectedValue(new Error('quota'));
    const store = createOnboardingStore(storage);
    await expect(store.markSeen()).resolves.toBeUndefined();
    expect(store.isSeen()).toBe(true);
  });

  it('stops notifying after unsubscribe', async () => {
    const store = createOnboardingStore(memoryStorage());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    await store.markSeen();
    expect(listener).not.toHaveBeenCalled();
  });
});
