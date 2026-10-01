import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimeoutError, withTimeout } from '../../src/lib/timeout';

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 100)).resolves.toBe(42);
  });

  it('rejects with TimeoutError when the promise never settles', async () => {
    const pending = withTimeout(new Promise(() => {}), 100, 'db.query');
    vi.advanceTimersByTime(100);
    await expect(pending).rejects.toBeInstanceOf(TimeoutError);
    await expect(pending).rejects.toMatchObject({ label: 'db.query', ms: 100 });
  });

  it('passes through the original rejection instead of a timeout', async () => {
    const boom = new Error('boom');
    await expect(withTimeout(Promise.reject(boom), 100)).rejects.toBe(boom);
  });

  it('clears its timer so no timeout fires after success', async () => {
    await withTimeout(Promise.resolve('ok'), 100);
    expect(vi.getTimerCount()).toBe(0);
  });
});
