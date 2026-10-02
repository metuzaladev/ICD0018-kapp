import { MAP_MAX_SPAN_DEGREES, type MapPlace, type MapTag, type PlaceAmenity, type PlaceCategory } from '@kapp/shared';

import type { IconName } from '@/components/icon-sources';

import type { MapCategory, PlaceKind } from './map-categories';

/**
 * Pure helpers for M9b Avasta and the map places (docs/16-avasta-ja-kapad.md). No React, no
 * native modules: unit-tested in test/explore.test.ts.
 */

/* ---------- map: bounding box of the visible region ---------- */

/** [west, south, east, north] — MapLibre's LngLatBounds. */
export type LngLatBox = readonly [number, number, number, number];
export type Bbox = { minLat: number; minLng: number; maxLat: number; maxLng: number };

/**
 * Grid the box is snapped to (0.02° ≈ 2 km north–south). Snapping outwards means small pans reuse
 * the cached request instead of firing a new one for every few metres, and the query key stays
 * stable while the user looks around.
 */
const GRID = 0.02;
const snapDown = (n: number) => Math.floor(n / GRID) * GRID;
const snapUp = (n: number) => Math.ceil(n / GRID) * GRID;
const round = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * The /map/places query box for what is on screen. The API accepts at most 1° per side
 * (MAP_MAX_SPAN_DEGREES): a zoomed-out view is shrunk around its centre instead of failing with
 * 400 — further-out pins appear when the user zooms in. Invalid input (NaN) gives null.
 */
export function bboxFromRegion(bounds: LngLatBox, maxSpan: number = MAP_MAX_SPAN_DEGREES): Bbox | null {
  const [west, south, east, north] = bounds;
  if (![west, south, east, north].every(Number.isFinite)) return null;
  const centerLat = (south + north) / 2;
  const centerLng = (west + east) / 2;
  // Half of the allowed span minus one grid cell, so snapping outwards cannot exceed the limit.
  const half = maxSpan / 2 - GRID;
  const latHalf = Math.min(Math.abs(north - south) / 2, half);
  const lngHalf = Math.min(Math.abs(east - west) / 2, half);
  const box = {
    minLat: round(clamp(snapDown(centerLat - latHalf), -90, 90)),
    maxLat: round(clamp(snapUp(centerLat + latHalf), -90, 90)),
    minLng: round(clamp(snapDown(centerLng - lngHalf), -180, 180)),
    maxLng: round(clamp(snapUp(centerLng + lngHalf), -180, 180)),
  };
  // A zero-size box (a single point) is widened by one cell so maxLat > minLat holds.
  if (box.maxLat <= box.minLat) box.maxLat = round(box.minLat + GRID);
  if (box.maxLng <= box.minLng) box.maxLng = round(box.minLng + GRID);
  return box;
}

/** Box around a point before the map has reported its region (≈ city-district view). */
export function bboxAround(center: { lat: number; lng: number }, halfSpan = 0.06): Bbox {
  return bboxFromRegion([center.lng - halfSpan * 2, center.lat - halfSpan, center.lng + halfSpan * 2, center.lat + halfSpan])!;
}

/* ---------- map: chips → API tags, places → pins ---------- */

/** Which /map/places tags a Kaart chip asks for; `undefined` = every tag ("Kõik"). */
export function mapTagsFor(category: MapCategory): MapTag[] | undefined {
  switch (category) {
    case 'all':
      return undefined;
    case 'parks':
      return ['parks'];
    case 'cafes':
      return ['cafes'];
    case 'beaches':
      return ['beaches'];
    case 'services':
      return ['services'];
    case 'vets':
      return ['clinics'];
  }
}

/** Pin variant (Figma "Map Pin / Place") for a place from /map/places, decided by its tag. */
export function placeKindOf(place: Pick<MapPlace, 'tag'>): PlaceKind {
  switch (place.tag) {
    case 'parks':
      return 'park';
    case 'cafes':
      return 'cafe';
    case 'beaches':
      return 'beach';
    case 'services':
      return 'service';
    case 'clinics':
      return 'vet';
    case 'other':
      return 'shop';
  }
}

/** Route that opens a map place: `kind` says which detail endpoint the id belongs to. */
export type PlaceRoute =
  | { pathname: '/parks/[parkId]'; params: { parkId: string } }
  | { pathname: '/services/[providerId]'; params: { providerId: string } }
  | { pathname: '/place-posts/[postId]'; params: { postId: string } };

export function placeRoute(place: Pick<MapPlace, 'id' | 'kind'>): PlaceRoute {
  switch (place.kind) {
    case 'park':
      return { pathname: '/parks/[parkId]', params: { parkId: place.id } };
    case 'provider':
      return { pathname: '/services/[providerId]', params: { providerId: place.id } };
    case 'post':
      return { pathname: '/place-posts/[postId]', params: { postId: place.id } };
  }
}

/* ---------- Avasta: categories, amenities, feed filters ---------- */

export const PLACE_CATEGORY_ICON: Record<PlaceCategory, IconName> = {
  cafe: 'coffee',
  park: 'trees',
  beach: 'waves',
  shop: 'store',
  other: 'map-pin',
};

/** Category pill colour on a post photo: the same `map*` token as the pin on the map. */
export const PLACE_CATEGORY_COLOR = {
  cafe: 'mapCafe',
  park: 'mapPark',
  beach: 'mapBeach',
  shop: 'mapService',
  other: 'mapService',
} as const satisfies Record<PlaceCategory, string>;

/** Figma "Feed / Place Post" amenity chips: 14 pt Lucide icon + label. */
export const AMENITY_ICON: Record<PlaceAmenity, IconName> = {
  dogs_inside: 'dog',
  water_bowl: 'droplet',
  terrace: 'sun',
  dog_treats: 'cookie',
  fenced_area: 'fence',
  off_leash: 'footprints',
  shade: 'trees',
  stream: 'waves',
};

/** Categories offered in "Soovita kohta" (Figma: Kohvik, Park, Rand, Pood) plus "Muu". */
export const SUGGEST_CATEGORIES: readonly PlaceCategory[] = ['cafe', 'park', 'beach', 'shop', 'other'];

/** Avasta filter chips (Figma 84:7825): Lähedal, Kohvikud, Pargid, Rannad, Poed; Sõbrad. */
export const FEED_CATEGORY_CHIPS: readonly PlaceCategory[] = ['cafe', 'park', 'beach', 'shop'];

export type FeedFilters = {
  /** "Lähedal": only posts within the radius of the user (or Tallinn's centre). */
  near: boolean;
  /** One category at a time; tapping the chosen chip again clears it. */
  category: PlaceCategory | null;
  /** "Sõbrad": posts of accepted friends only. */
  friends: boolean;
};

export const DEFAULT_FEED_FILTERS: FeedFilters = { near: true, category: null, friends: false };

/** Feed radius for "Lähedal": Tallinn and its edges. */
export const NEAR_RADIUS_KM = 15;

/** Query parameters for GET /place-posts (without the paging cursor). */
export function feedQueryParams(filters: FeedFilters, origin: { lat: number; lng: number }): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (filters.near) {
    params.lat = origin.lat;
    params.lng = origin.lng;
    params.radiusKm = NEAR_RADIUS_KM;
  }
  if (filters.category) params.category = filters.category;
  if (filters.friends) params.scope = 'friends';
  return params;
}

/** Category chip toggle: exclusive, a second tap clears. */
export function toggleCategory(filters: FeedFilters, category: PlaceCategory): FeedFilters {
  return { ...filters, category: filters.category === category ? null : category };
}

/* ---------- optimistic like / save ---------- */

type PostLike = { id: string; liked: boolean; saved: boolean; likeCount: number };
type PostPages<P> = { pages: { items: P[]; nextCursor: string | null }[]; pageParams: unknown[] };

/**
 * Applies a like/save change to one cached query's data, whatever its shape: a single post (detail)
 * or an infinite list (feed, mine, saved). Returns the same object when the post is not in it, so
 * TanStack Query does not notify unrelated screens.
 */
export function patchPostData<P extends PostLike, D extends P | PostPages<P> | undefined>(data: D, postId: string, patch: Partial<PostLike>): D {
  if (!data) return data;
  if ('pages' in data) {
    let changed = false;
    const pages = data.pages.map((page) => {
      if (!page.items.some((p) => p.id === postId)) return page;
      changed = true;
      return { ...page, items: page.items.map((p) => (p.id === postId ? { ...p, ...patch } : p)) };
    });
    return (changed ? { ...data, pages } : data) as D;
  }
  return ((data as P).id === postId ? { ...data, ...patch } : data) as D;
}

/** The optimistic state after tapping the heart. */
export function toggledLike(post: PostLike): Pick<PostLike, 'liked' | 'likeCount'> {
  return post.liked ? { liked: false, likeCount: Math.max(0, post.likeCount - 1) } : { liked: true, likeCount: post.likeCount + 1 };
}

/** Amenity chip toggle in "Soovita kohta", kept in the schema's order so the request is stable. */
export function toggleAmenity(list: readonly PlaceAmenity[], amenity: PlaceAmenity, order: readonly PlaceAmenity[]): PlaceAmenity[] {
  const set = new Set(list);
  if (set.has(amenity)) set.delete(amenity);
  else set.add(amenity);
  return order.filter((a) => set.has(a));
}
