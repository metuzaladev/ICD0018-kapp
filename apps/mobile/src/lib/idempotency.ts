/**
 * Idempotency keys for "Lunasta" (POST /me/redemptions, docs/16). The server returns the first
 * redemption (200) when it sees a key again, so the app must:
 *
 * - make a new key once per user tap (one tap = one intended redemption);
 * - keep the same key while the outcome is unknown (network error, timeout, 5xx) so the retry
 *   cannot spend points twice;
 * - forget it after an answer that settles the tap (success, or a 4xx such as 409 "not enough
 *   paws"), so the next tap is a new redemption.
 *
 * Pure (no React): the screen keeps one tracker in a ref. Unit-tested in test/idempotency.test.ts.
 */

/** RFC 4122 version 4 UUID (the API validates `z.uuid()`). */
export function uuidV4(randomByte: () => number = defaultRandomByte): string {
  const bytes = Array.from({ length: 16 }, () => randomByte() & 0xff);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Prefers the platform CSPRNG when the runtime has one; otherwise Math.random. The key is not a
 * secret — it only has to be unique per user (the server scopes it by user id), so no native
 * crypto module is added for it.
 */
function defaultRandomByte(): number {
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoApi?.getRandomValues) return cryptoApi.getRandomValues(new Uint8Array(1))[0]!;
  return Math.floor(Math.random() * 256);
}

export type IdempotencyTracker = {
  /** The key for this attempt: the pending one (a retry) or a new one. */
  begin(): string;
  /** Call with the outcome; `retryable` keeps the key for the next attempt. */
  settle(outcome: { retryable: boolean }): void;
  /** The key waiting for a retry, if any (for tests and debugging). */
  pending(): string | null;
};

export function createIdempotencyTracker(makeKey: () => string = () => uuidV4()): IdempotencyTracker {
  let key: string | null = null;
  return {
    begin() {
      key ??= makeKey();
      return key;
    },
    settle({ retryable }) {
      if (!retryable) key = null;
    },
    pending: () => key,
  };
}

/** Whether a failed request may have reached the server: network/timeout (status 0) and 5xx. */
export function isRetryableStatus(status: number | undefined): boolean {
  return status === undefined || status === 0 || status >= 500;
}
