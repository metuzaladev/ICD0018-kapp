import type { ParkFeatureFilters } from '@kapp/shared';
import { useSyncExternalStore } from 'react';

/**
 * Filters chosen on the "Filtrid" screen, shared by the map and list.
 * Why a tiny module store instead of a library: it is one object used by two screens; React's
 * useSyncExternalStore is enough and adds no dependency.
 */
export type ParkFilters = ParkFeatureFilters & { radiusKm: number };

export const DEFAULT_FILTERS: ParkFilters = { radiusKm: 5 };

let current: ParkFilters = DEFAULT_FILTERS;
const listeners = new Set<() => void>();

export function setParkFilters(next: ParkFilters) {
  current = next;
  listeners.forEach((l) => l());
}

export function useParkFilters(): ParkFilters {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/** Number of active feature filters, shown on the "Filtrid" chip. */
export function activeFilterCount(filters: ParkFilters): number {
  return (['fenced', 'smallDogArea', 'water', 'lighting'] as const).filter((k) => filters[k]).length;
}
