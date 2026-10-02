import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  selectionAsync: vi.fn(),
  notificationAsync: vi.fn(),
}));

vi.mock('expo-haptics', () => ({
  ...native,
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

import { haptic, type HapticReason } from '@/lib/haptics';

describe('haptic', () => {
  beforeEach(() => {
    native.selectionAsync.mockReset().mockResolvedValue(undefined);
    native.notificationAsync.mockReset().mockResolvedValue(undefined);
  });

  it('plays the selection pattern for a selection', () => {
    haptic('selection');
    expect(native.selectionAsync).toHaveBeenCalledOnce();
    expect(native.notificationAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['success', 'success'],
    ['warning', 'warning'],
    ['error', 'error'],
  ] as const)('plays the %s notification', (reason, type) => {
    haptic(reason);
    expect(native.notificationAsync).toHaveBeenCalledWith(type);
  });

  it('ignores an unknown or null reason instead of throwing', () => {
    expect(() => haptic('party' as HapticReason)).not.toThrow();
    expect(() => haptic(null as unknown as HapticReason)).not.toThrow();
    expect(native.selectionAsync).not.toHaveBeenCalled();
    expect(native.notificationAsync).not.toHaveBeenCalled();
  });

  it('swallows a rejected promise (Low Power Mode, no Taptic Engine)', async () => {
    native.notificationAsync.mockRejectedValue(new Error('unavailable'));
    expect(() => haptic('success')).not.toThrow();
    // Let the rejection settle; an unhandled rejection would fail the test run.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('swallows a synchronous native failure (module missing in an old build)', () => {
    native.selectionAsync.mockImplementation(() => {
      throw new Error('native module not found');
    });
    expect(() => haptic('selection')).not.toThrow();
  });
});
