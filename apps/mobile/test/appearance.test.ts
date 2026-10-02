import { describe, expect, it, vi } from 'vitest';

import {
  APPEARANCE_STORAGE_KEY,
  createAppearanceStore,
  DEFAULT_APPEARANCE,
  isAppearancePreference,
  nativeSchemeFor,
  type PreferenceStorage,
} from '@/lib/appearance';

function memoryStorage(initial: string | null = null) {
  const state: { value: string | null } = { value: initial };
  return Object.assign(state, {
    getItem: vi.fn<PreferenceStorage['getItem']>(async () => state.value),
    setItem: vi.fn<PreferenceStorage['setItem']>(async (_key, value) => {
      state.value = value;
    }),
  });
}

const failing: PreferenceStorage = {
  getItem: () => Promise.reject(new Error('storage unavailable')),
  setItem: () => Promise.reject(new Error('disk full')),
};

describe('appearance preference', () => {
  it('defaults to light (the redesign is drawn in light mode)', () => {
    expect(DEFAULT_APPEARANCE).toBe('light');
    expect(createAppearanceStore(memoryStorage(), vi.fn()).get()).toBe('light');
  });

  it('maps "system" to unspecified so the OS decides again', () => {
    expect(nativeSchemeFor('system')).toBe('unspecified');
    expect(nativeSchemeFor('light')).toBe('light');
    expect(nativeSchemeFor('dark')).toBe('dark');
  });

  it('validates stored values', () => {
    expect(isAppearancePreference('dark')).toBe(true);
    expect(isAppearancePreference('sepia')).toBe(false);
    expect(isAppearancePreference(null)).toBe(false);
  });

  it('loads and applies the stored choice', async () => {
    const apply = vi.fn();
    const storage = memoryStorage('dark');
    const store = createAppearanceStore(storage, apply);
    await expect(store.load()).resolves.toBe('dark');
    expect(storage.getItem).toHaveBeenCalledWith(APPEARANCE_STORAGE_KEY);
    expect(apply).toHaveBeenLastCalledWith('dark');
  });

  it('applies light on a fresh install (nothing stored)', async () => {
    const apply = vi.fn();
    await createAppearanceStore(memoryStorage(null), apply).load();
    expect(apply).toHaveBeenLastCalledWith('light');
  });

  it('ignores an unknown stored value', async () => {
    const store = createAppearanceStore(memoryStorage('purple'), vi.fn());
    await expect(store.load()).resolves.toBe('light');
  });

  it('keeps the default when storage cannot be read', async () => {
    const apply = vi.fn();
    const store = createAppearanceStore(failing, apply);
    await expect(store.load()).resolves.toBe('light');
    expect(apply).toHaveBeenLastCalledWith('light');
  });

  it('applies and notifies immediately, persists the choice', async () => {
    const apply = vi.fn();
    const storage = memoryStorage();
    const store = createAppearanceStore(storage, apply);
    const listener = vi.fn();
    store.subscribe(listener);
    await store.set('system');
    expect(store.get()).toBe('system');
    expect(apply).toHaveBeenLastCalledWith('unspecified');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(storage.value).toBe('system');
  });

  it('still applies for the session when saving fails', async () => {
    const apply = vi.fn();
    const store = createAppearanceStore(failing, apply);
    await expect(store.set('dark')).resolves.toBeUndefined();
    expect(store.get()).toBe('dark');
    expect(apply).toHaveBeenLastCalledWith('dark');
  });

  it('survives a failing native override', async () => {
    const store = createAppearanceStore(memoryStorage(), () => {
      throw new Error('no window yet');
    });
    await expect(store.set('dark')).resolves.toBeUndefined();
    expect(store.get()).toBe('dark');
  });

  it('stops notifying after unsubscribe', async () => {
    const store = createAppearanceStore(memoryStorage(), vi.fn());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    await store.set('dark');
    expect(listener).not.toHaveBeenCalled();
  });
});
