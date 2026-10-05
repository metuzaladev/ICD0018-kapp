import { checkInInputSchema, dogInputSchema, plannedVisitInputSchema, reviewInputSchema } from '@kapp/shared';
import { describe, expect, it } from 'vitest';

const PARK = '4ddabe8d-7306-4724-a125-ace7ae3a87b9';
const DOG = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((i) => i.message) ?? [];

describe('plannedVisitInputSchema', () => {
  const valid = { parkId: PARK, startsAt: inMinutes(60), endsAt: inMinutes(120) };

  it('accepts a plan for later today', () => {
    expect(plannedVisitInputSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['start in the past', { startsAt: inMinutes(-60), endsAt: inMinutes(30) }, 'algus ei saa olla minevikus'],
    ['end before start', { startsAt: inMinutes(60), endsAt: inMinutes(30) }, 'lõpp peab olema pärast algust'],
    ['longer than 4 h', { startsAt: inMinutes(60), endsAt: inMinutes(60 + 5 * 60) }, 'kuni 4 tundi'],
    ['more than 30 days ahead', { startsAt: inMinutes(31 * 1440), endsAt: inMinutes(31 * 1440 + 60) }, 'planeeri kuni 30 päeva ette'],
  ])('rejects %s', (_case, times, message) => {
    const result = plannedVisitInputSchema.safeParse({ ...valid, ...times });
    expect(result.success).toBe(false);
    expect(messages(result).join(' ')).toContain(message);
  });

  it('accepts a start a few minutes ago (clock skew)', () => {
    expect(plannedVisitInputSchema.safeParse({ ...valid, startsAt: inMinutes(-2) }).success).toBe(true);
  });

  it('rejects a timestamp without a time zone', () => {
    expect(plannedVisitInputSchema.safeParse({ ...valid, startsAt: '2026-10-05T17:00:00' }).success).toBe(false);
  });
});

describe('checkInInputSchema', () => {
  it('defaults the duration to 60 minutes', () => {
    expect(checkInInputSchema.parse({ parkId: PARK, dogIds: [DOG] }).durationMinutes).toBe(60);
  });

  it.each([
    ['no dogs', { dogIds: [] }],
    ['the same dog twice', { dogIds: [DOG, DOG] }],
    ['a 4-hour visit', { dogIds: [DOG], durationMinutes: 240 }],
    ['a non-UUID dog id', { dogIds: ['1'] }],
  ])('rejects %s', (_case, input) => {
    expect(checkInInputSchema.safeParse({ parkId: PARK, ...input }).success).toBe(false);
  });
});

describe('dogInputSchema', () => {
  it('normalises missing optional fields to null', () => {
    expect(dogInputSchema.parse({ name: 'Freddy' })).toEqual({
      name: 'Freddy',
      breed: null,
      sex: null,
      birthDate: null,
      weightKg: null,
      temperament: null,
    });
  });

  it('rejects a birth date in the future', () => {
    const next = `${new Date().getFullYear() + 1}-01-01`;
    expect(messages(dogInputSchema.safeParse({ name: 'Freddy', birthDate: next }))).toContain('kapp:sünnipäev ei saa olla tulevikus');
  });
});

describe('reviewInputSchema', () => {
  it.each([0, 6, 4.5, '5'])('rejects rating %s', (rating) => {
    expect(reviewInputSchema.safeParse({ rating }).success).toBe(false);
  });
});
