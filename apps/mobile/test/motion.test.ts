import { describe, expect, it } from 'vitest';

import { Durations, MAX_STAGGERED_ROWS, motionDuration, STAGGER_MS, staggerDelay } from '@/lib/motion';

describe('staggerDelay', () => {
  it('delays each row by one step', () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(1)).toBe(STAGGER_MS);
    expect(staggerDelay(3)).toBe(3 * STAGGER_MS);
  });

  it('caps the delay so long lists appear quickly', () => {
    expect(staggerDelay(MAX_STAGGERED_ROWS + 50)).toBe(MAX_STAGGERED_ROWS * STAGGER_MS);
  });

  it('gives invalid indexes no delay', () => {
    expect(staggerDelay(-1)).toBe(0);
    expect(staggerDelay(Number.NaN)).toBe(0);
    expect(staggerDelay(Number.POSITIVE_INFINITY)).toBe(0);
    expect(staggerDelay(null as unknown as number)).toBe(0);
  });

  it('rounds fractional indexes down', () => {
    expect(staggerDelay(2.7)).toBe(2 * STAGGER_MS);
  });
});

describe('motionDuration', () => {
  it('keeps the duration when motion is allowed', () => {
    expect(motionDuration(Durations.standard, false)).toBe(Durations.standard);
  });

  it('is zero when Reduce Motion is on', () => {
    expect(motionDuration(Durations.emphasized, true)).toBe(0);
  });

  it('is zero for invalid durations', () => {
    expect(motionDuration(-5, false)).toBe(0);
    expect(motionDuration(Number.NaN, false)).toBe(0);
    expect(motionDuration(undefined as unknown as number, false)).toBe(0);
  });

  it('keeps every token brief (HIG: under 400 ms)', () => {
    for (const value of Object.values(Durations)) expect(value).toBeLessThan(400);
  });
});
