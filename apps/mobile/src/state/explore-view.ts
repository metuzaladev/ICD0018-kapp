import { useSyncExternalStore } from 'react';

import type { MapCategory } from '@/lib/map-categories';

/**
 * Which half of the Kaart tab is showing: the full-screen map or the Avasta feed (docs/16 → M9b-app).
 *
 * Why a module store and not a route param or a nested navigator: the two views are one tab (Figma
 * draws Kaart / Avasta as a Segmented Control, not as screens), switching must not push history
 * (the back gesture should not flip between them), and other screens need to steer the tab in one
 * call — "Kaardil" on a post centres the map on it, Pood's mini map opens the map on Teenused,
 * "Kogukonna soovitused" opens the feed. A param would stay on the tab route and replay the
 * one-shot focus every time the tab is re-entered. Same pattern as state/park-filters.ts.
 */
export type ExploreView = 'map' | 'feed';

/** A one-shot request for the map: centre on a point and/or select a chip. Consumed by the map. */
export type MapFocus = { lat?: number; lng?: number; category?: MapCategory; nonce: number };

type State = { view: ExploreView; focus: MapFocus | null };

let state: State = { view: 'map', focus: null };
let nonce = 0;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

export function setExploreView(view: ExploreView) {
  if (state.view !== view) set({ ...state, view });
}

/** Switch to the map and ask it to centre on a place and/or select a chip. */
export function focusMap(focus: Omit<MapFocus, 'nonce'>) {
  nonce += 1;
  set({ view: 'map', focus: { ...focus, nonce } });
}

/** Called by the map once it has applied the focus. */
export function clearMapFocus(handled: number) {
  if (state.focus?.nonce === handled) set({ ...state, focus: null });
}

export function useExploreState(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
