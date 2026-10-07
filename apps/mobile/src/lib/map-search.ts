import { SEARCH_MIN_LENGTH, type SearchResult } from '@kapp/shared';

import type { IconName } from '@/components/icon-sources';

/**
 * Pure helpers for the Kaart search suggestions (docs/19). Kept out of the screen so they are
 * unit-tested in Node (test/map-search.test.ts).
 */

/** Wait this long after the last keystroke before asking the API: one request per pause, not per letter. */
export const SEARCH_DEBOUNCE_MS = 250;

/** The trimmed query when it is long enough to search, otherwise null (no request, no list). */
export function searchableQuery(text: string): string | null {
  const q = text.trim();
  return q.length >= SEARCH_MIN_LENGTH ? q : null;
}

/** Icon for a suggestion row, from its kind and category. */
export function searchResultIcon(result: Pick<SearchResult, 'kind' | 'category'>): IconName {
  switch (result.kind) {
    case 'park':
      return result.category === 'beach' ? 'waves' : 'trees';
    case 'provider':
      return result.category === 'vet' ? 'stethoscope' : 'scissors';
    case 'post':
      if (result.category === 'cafe') return 'coffee';
      if (result.category === 'beach') return 'waves';
      if (result.category === 'park') return 'trees';
      return 'store';
    case 'address':
      return 'map-pin';
  }
}

/** Where tapping the suggestion's detail action leads; addresses have no page (they only move the map). */
export function searchResultRoute(result: Pick<SearchResult, 'kind' | 'id'>):
  | { pathname: '/parks/[parkId]'; params: { parkId: string } }
  | { pathname: '/services/[providerId]'; params: { providerId: string } }
  | { pathname: '/place-posts/[postId]'; params: { postId: string } }
  | null {
  if (!result.id) return null;
  switch (result.kind) {
    case 'park':
      return { pathname: '/parks/[parkId]', params: { parkId: result.id } };
    case 'provider':
      return { pathname: '/services/[providerId]', params: { providerId: result.id } };
    case 'post':
      return { pathname: '/place-posts/[postId]', params: { postId: result.id } };
    case 'address':
      return null;
  }
}

/**
 * Next zoom for the + / − buttons: one whole level per tap, within MapLibre's useful range for a
 * city map (6 = all of Estonia, 19 = a single yard). Fractional zooms (after a pinch) snap to the
 * next whole level in the tapped direction, so a tap always visibly changes the map.
 */
export const MIN_ZOOM = 6;
export const MAX_ZOOM = 19;
export function stepZoom(current: number, direction: 1 | -1): number {
  const next = direction > 0 ? Math.floor(current + 1e-6) + 1 : Math.ceil(current - 1e-6) - 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
}
