import { DAY_PARTS, type DayPart, type ParkActivity, type PlacePost } from '@kapp/shared';

import { parkKindOf } from './map-categories';

/**
 * Pure helpers for the two M11 Home sections (docs/18-avalehe-tegevus.md): "Lemmikparkides täna"
 * and "Kogukonna soovitused". No React, no native modules: unit-tested in test/home-activity.test.ts.
 */

/** Favourite parks shown on Home (the screen has room for three rows before the reminders). */
export const MAX_ACTIVITY_PARKS = 3;
/** Without favourites Home falls back to this many nearest dog parks. */
export const FALLBACK_ACTIVITY_PARKS = 2;
export const COMMUNITY_PICKS = 3;

type ParkLike = { id: string; fenced: boolean; water: boolean };

/**
 * Which parks the activity section asks about: the user's favourites (newest first, as the API
 * lists them), or — with no favourites — the nearest dog parks (swimming spots only if nothing else).
 */
export function activityParkIds(favorites: readonly ParkLike[] | undefined, nearby: readonly ParkLike[]): { ids: string[]; source: 'favorites' | 'nearby' } {
  if (favorites && favorites.length > 0) return { ids: favorites.slice(0, MAX_ACTIVITY_PARKS).map((p) => p.id), source: 'favorites' };
  const dogParks = nearby.filter((p) => parkKindOf(p) === 'park');
  const pool = dogParks.length > 0 ? dogParks : nearby;
  return { ids: pool.slice(0, FALLBACK_ACTIVITY_PARKS).map((p) => p.id), source: 'nearby' };
}

/** Parts of today that still have planned visits, in day order (past parts are 0 from the API). */
export function plannedParts(planned: ParkActivity['planned']): { part: DayPart; count: number }[] {
  return DAY_PARTS.filter((part) => planned[part] > 0).map((part) => ({ part, count: planned[part] }));
}

/** Nothing to tell about the park today: no dogs now, no plans. */
export function isQuiet(activity: Pick<ParkActivity, 'activeDogs' | 'planned'>): boolean {
  return activity.activeDogs === 0 && plannedParts(activity.planned).length === 0;
}

/**
 * Home's "Kogukonna soovitused": the newest approved posts. The feed also returns the viewer's own
 * pending posts (with "Ootab kinnitust"); those belong in Avasta and "Minu soovitused", not here.
 */
export function communityPicks<P extends Pick<PlacePost, 'status'>>(posts: readonly P[], count = COMMUNITY_PICKS): P[] {
  return posts.filter((p) => p.status === 'approved').slice(0, count);
}

/**
 * Whether "Oleme siin" (check in here) is the honest main action on the nearest-park card. From
 * 1+ km away "we are here" is simply not true, so the card offers directions instead; without the
 * user's real position (Tallinn fallback) it cannot know, so it opens the park page.
 */
export const CHECK_IN_RADIUS_KM = 0.3;

export type NearestParkAction = 'here' | 'checkIn' | 'directions' | 'open';

export function nearestParkAction({
  checkedInHere,
  distanceKm,
  usingFallback,
}: {
  checkedInHere: boolean;
  distanceKm: number | undefined;
  usingFallback: boolean;
}): NearestParkAction {
  if (checkedInHere) return 'here';
  if (usingFallback || distanceKm === undefined || !Number.isFinite(distanceKm)) return 'open';
  return distanceKm <= CHECK_IN_RADIUS_KM ? 'checkIn' : 'directions';
}
