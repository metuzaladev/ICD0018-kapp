import { describe, expect, it } from 'vitest';

import {
  activityParkIds,
  CHECK_IN_RADIUS_KM,
  communityPicks,
  FALLBACK_ACTIVITY_PARKS,
  isQuiet,
  MAX_ACTIVITY_PARKS,
  nearestParkAction,
  plannedParts,
} from '@/lib/home-activity';

const park = (id: string, kind: 'park' | 'swim' = 'park') => ({ id, fenced: kind === 'park', water: kind === 'swim' });

describe('activityParkIds', () => {
  it('uses favourites first, newest first as the API lists them, at most three', () => {
    const favorites = ['f1', 'f2', 'f3', 'f4'].map((id) => park(id));
    expect(activityParkIds(favorites, [park('n1')])).toEqual({ ids: ['f1', 'f2', 'f3'], source: 'favorites' });
    expect(MAX_ACTIVITY_PARKS).toBe(3);
  });

  it('falls back to the two nearest dog parks, skipping swimming spots', () => {
    const nearby = [park('swim', 'swim'), park('n1'), park('n2'), park('n3')];
    expect(activityParkIds([], nearby)).toEqual({ ids: ['n1', 'n2'], source: 'nearby' });
    expect(FALLBACK_ACTIVITY_PARKS).toBe(2);
  });

  it('uses swimming spots only when nothing else is near; nothing near → no ids', () => {
    expect(activityParkIds(undefined, [park('s1', 'swim')]).ids).toEqual(['s1']);
    expect(activityParkIds(undefined, [])).toEqual({ ids: [], source: 'nearby' });
  });
});

describe('plannedParts / isQuiet', () => {
  it('keeps parts with visits in day order', () => {
    expect(plannedParts({ morning: 0, day: 2, evening: 4 })).toEqual([
      { part: 'day', count: 2 },
      { part: 'evening', count: 4 },
    ]);
  });

  it('quiet = no dogs now and no plans', () => {
    expect(isQuiet({ activeDogs: 0, planned: { morning: 0, day: 0, evening: 0 } })).toBe(true);
    expect(isQuiet({ activeDogs: 1, planned: { morning: 0, day: 0, evening: 0 } })).toBe(false);
    expect(isQuiet({ activeDogs: 0, planned: { morning: 0, day: 0, evening: 1 } })).toBe(false);
  });
});

describe('communityPicks', () => {
  it('drops own pending and rejected posts and keeps the newest three', () => {
    const posts = [
      { id: 'mine', status: 'pending' as const },
      { id: 'a', status: 'approved' as const },
      { id: 'rej', status: 'rejected' as const },
      { id: 'b', status: 'approved' as const },
      { id: 'c', status: 'approved' as const },
      { id: 'd', status: 'approved' as const },
    ];
    expect(communityPicks(posts).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('nearestParkAction ("Oleme siin" only when it is true)', () => {
  it('within 300 m → check in', () => {
    expect(nearestParkAction({ checkedInHere: false, distanceKm: 0.12, usingFallback: false })).toBe('checkIn');
    expect(nearestParkAction({ checkedInHere: false, distanceKm: CHECK_IN_RADIUS_KM, usingFallback: false })).toBe('checkIn');
  });

  it('further away → directions', () => {
    expect(nearestParkAction({ checkedInHere: false, distanceKm: 0.31, usingFallback: false })).toBe('directions');
    expect(nearestParkAction({ checkedInHere: false, distanceKm: 1.4, usingFallback: false })).toBe('directions');
  });

  it('distance from the Tallinn fallback or unknown → open the park', () => {
    expect(nearestParkAction({ checkedInHere: false, distanceKm: 0.1, usingFallback: true })).toBe('open');
    expect(nearestParkAction({ checkedInHere: false, distanceKm: undefined, usingFallback: false })).toBe('open');
    expect(nearestParkAction({ checkedInHere: false, distanceKm: NaN, usingFallback: false })).toBe('open');
  });

  it('already checked in there → "Oled siin", whatever the distance', () => {
    expect(nearestParkAction({ checkedInHere: true, distanceKm: 3, usingFallback: true })).toBe('here');
  });
});
