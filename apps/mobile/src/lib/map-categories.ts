import type { ServiceCategory } from '@kapp/shared';

import type { IconName } from '@/components/icon-sources';

/**
 * Kaart tab category chips (Figma "Explore / Map": Kõik, Pargid, Kohvikud, Teenused, Rannad,
 * Kliinikud) and what each one shows. Pure: unit-tested in test/map-categories.test.ts.
 */
export const MAP_CATEGORIES = ['all', 'parks', 'cafes', 'services', 'beaches', 'vets'] as const;
export type MapCategory = (typeof MAP_CATEGORIES)[number];

/** Category of a single place on the map → Figma "Map Pin / Place" variant and `map*` colour. */
export type PlaceKind = 'park' | 'cafe' | 'beach' | 'service' | 'vet';

export const CATEGORY_ICON: Record<MapCategory, IconName> = {
  all: 'layers',
  parks: 'trees',
  cafes: 'coffee',
  services: 'scissors',
  beaches: 'waves',
  vets: 'stethoscope',
};

export const PLACE_ICON: Record<PlaceKind, IconName> = {
  park: 'trees',
  cafe: 'coffee',
  beach: 'waves',
  service: 'scissors',
  vet: 'stethoscope',
};

/**
 * Categories backed by real data today: parks (M2) and service providers (M6, which have
 * coordinates). Cafés and beaches arrive with the M9b places API — their chips stay hidden until
 * then, because a filter that always shows an empty map would look broken.
 */
export const AVAILABLE_CATEGORIES: readonly MapCategory[] = ['all', 'parks', 'services', 'vets'];

/** A provider's service category on the map: clinics have their own chip and colour. */
export function providerPlaceKind(category: ServiceCategory): Extract<PlaceKind, 'service' | 'vet'> {
  return category === 'vet' ? 'vet' : 'service';
}

/** Which map category a place belongs to (for filtering). */
export function categoryOf(kind: PlaceKind): Exclude<MapCategory, 'all'> {
  switch (kind) {
    case 'park':
      return 'parks';
    case 'cafe':
      return 'cafes';
    case 'beach':
      return 'beaches';
    case 'service':
      return 'services';
    case 'vet':
      return 'vets';
  }
}

export function categoryShows(selected: MapCategory, kind: PlaceKind): boolean {
  return selected === 'all' || categoryOf(kind) === selected;
}

/** Whether the providers query is needed at all for the selected chip (saves a request). */
export function needsProviders(selected: MapCategory): boolean {
  return selected === 'all' || selected === 'services' || selected === 'vets';
}

/** Faces drawn on a dog pin; more dogs are summarised by the "N koera" pill. */
export const MAX_PIN_FACES = 3;

/**
 * How a park is drawn: with dogs there now it is a Figma "Map Pin / Dog" (one face, or a group of up
 * to three faces with an "N koera" pill), otherwise a "Map Pin / Place" park pin.
 */
export type ParkPinModel = { kind: 'place' } | { kind: 'dogs'; faces: number; showCount: boolean; count: number };

export function parkPinModel(activeDogs: number | undefined): ParkPinModel {
  const count = Math.max(0, Math.floor(activeDogs ?? 0));
  if (count === 0) return { kind: 'place' };
  return { kind: 'dogs', faces: Math.min(count, MAX_PIN_FACES), showCount: count > 1, count };
}
