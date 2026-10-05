import { describe, expect, it } from 'vitest';

import { createIdempotencyTracker, isRetryableStatus, uuidV4 } from '@/lib/idempotency';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('redemption idempotency keys', () => {
  it('makes RFC 4122 v4 UUIDs the API accepts', () => {
    expect(uuidV4()).toMatch(UUID_V4);
    expect(uuidV4(() => 0)).toBe('00000000-0000-4000-8000-000000000000');
    expect(uuidV4(() => 255)).toMatch(UUID_V4);
  });

  it('makes one key per tap and reuses it for a retry after a lost answer', () => {
    let n = 0;
    const tracker = createIdempotencyTracker(() => `key-${++n}`);
    const first = tracker.begin();
    tracker.settle({ retryable: true }); // network error: the outcome is unknown
    expect(tracker.begin()).toBe(first); // the retry must not spend twice
    tracker.settle({ retryable: false }); // success
    expect(tracker.pending()).toBeNull();
    expect(tracker.begin()).toBe('key-2'); // the next tap is a new redemption
  });

  it('a settled refusal (409 not enough paws) clears the key', () => {
    const tracker = createIdempotencyTracker(() => 'k');
    tracker.begin();
    tracker.settle({ retryable: isRetryableStatus(409) });
    expect(tracker.pending()).toBeNull();
  });

  it('treats network errors and 5xx as "may have reached the server"', () => {
    expect(isRetryableStatus(0)).toBe(true);
    expect(isRetryableStatus(undefined)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(409)).toBe(false);
    expect(isRetryableStatus(429)).toBe(false);
  });
});
