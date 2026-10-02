import { MAP_MAX_SPAN_DEGREES, MAP_TAGS, PLACE_AMENITIES, PLACE_CATEGORIES, type PlacePost } from '@kapp/shared';
import { describe, expect, it } from 'vitest';

import {
  AMENITY_ICON,
  bboxAround,
  bboxFromRegion,
  DEFAULT_FEED_FILTERS,
  feedQueryParams,
  mapCategoryForPost,
  mapTagsFor,
  nextFreeSlots,
  patchPostData,
  PLACE_CATEGORY_ICON,
  placeKindOf,
  placeRoute,
  toggleAmenity,
  toggleCategory,
  toggledLike,
} from '@/lib/explore';
import { MAP_CATEGORIES } from '@/lib/map-categories';

const TALLINN = { lat: 59.437, lng: 24.7536 };

describe('bbox from the visible map region', () => {
  it('snaps a city view outwards to the grid, so small pans reuse the cached request', () => {
    const a = bboxFromRegion([24.705, 59.415, 24.795, 59.455])!;
    const b = bboxFromRegion([24.707, 59.417, 24.797, 59.457])!;
    expect(a).toEqual(b);
    expect(a.minLat).toBeLessThanOrEqual(59.415);
    expect(a.maxLat).toBeGreaterThanOrEqual(59.457);
    expect(a.minLng).toBeLessThanOrEqual(24.705);
    expect(a.maxLng).toBeGreaterThanOrEqual(24.797);
  });

  it('never asks for more than the API allows (≤ 1° per side), shrinking around the centre', () => {
    const box = bboxFromRegion([21.0, 57.0, 28.0, 60.0])!;
    expect(box.maxLat - box.minLat).toBeLessThanOrEqual(MAP_MAX_SPAN_DEGREES);
    expect(box.maxLng - box.minLng).toBeLessThanOrEqual(MAP_MAX_SPAN_DEGREES);
    // Still centred on the view.
    expect((box.minLat + box.maxLat) / 2).toBeCloseTo(58.5, 1);
    expect((box.minLng + box.maxLng) / 2).toBeCloseTo(24.5, 1);
  });

  it('keeps max > min for a point-sized view (API rejects an empty box)', () => {
    const box = bboxFromRegion([24.75, 59.43, 24.75, 59.43])!;
    expect(box.maxLat).toBeGreaterThan(box.minLat);
    expect(box.maxLng).toBeGreaterThan(box.minLng);
  });

  it('rejects invalid bounds instead of sending NaN', () => {
    expect(bboxFromRegion([Number.NaN, 59, 25, 60])).toBeNull();
  });

  it('builds a starting box around the user before the map reports its region', () => {
    const box = bboxAround(TALLINN);
    expect(box.minLat).toBeLessThan(TALLINN.lat);
    expect(box.maxLat).toBeGreaterThan(TALLINN.lat);
    expect(box.maxLng - box.minLng).toBeLessThanOrEqual(MAP_MAX_SPAN_DEGREES);
  });
});

describe('map chips, tags and pins', () => {
  it('maps every chip to API tags; "Kõik" asks for all', () => {
    expect(mapTagsFor('all')).toBeUndefined();
    expect(mapTagsFor('vets')).toEqual(['clinics']);
    for (const chip of MAP_CATEGORIES) for (const tag of mapTagsFor(chip) ?? []) expect(MAP_TAGS).toContain(tag);
  });

  it('draws every API tag as a pin variant', () => {
    expect(MAP_TAGS.map((tag) => placeKindOf({ tag }))).toEqual(['park', 'cafe', 'beach', 'service', 'vet', 'shop']);
  });

  it('opens the detail screen that matches the place kind', () => {
    expect(placeRoute({ id: 'p', kind: 'park' })).toEqual({ pathname: '/parks/[parkId]', params: { parkId: 'p' } });
    expect(placeRoute({ id: 's', kind: 'provider' })).toEqual({ pathname: '/services/[providerId]', params: { providerId: 's' } });
    expect(placeRoute({ id: 'x', kind: 'post' })).toEqual({ pathname: '/place-posts/[postId]', params: { postId: 'x' } });
  });

  it('"Kaardil" selects the chip that shows the post (shops only under Kõik)', () => {
    expect(mapCategoryForPost('cafe')).toBe('cafes');
    expect(mapCategoryForPost('beach')).toBe('beaches');
    expect(mapCategoryForPost('shop')).toBe('all');
  });

  it('lists the earliest free times across the week', () => {
    const days = [
      { slots: [{ startsAt: '2026-10-03T07:00:00Z' }] },
      { slots: [] },
      { slots: [{ startsAt: '2026-10-02T13:30:00Z' }, { startsAt: '2026-10-02T14:00:00Z' }] },
    ];
    expect(nextFreeSlots(days)).toEqual(['2026-10-02T13:30:00Z', '2026-10-02T14:00:00Z', '2026-10-03T07:00:00Z']);
    expect(nextFreeSlots(days, 1)).toEqual(['2026-10-02T13:30:00Z']);
  });
});

describe('Avasta categories, amenities and filters', () => {
  it('has an icon for every category and amenity in the shared contract', () => {
    for (const c of PLACE_CATEGORIES) expect(PLACE_CATEGORY_ICON[c]).toBeTruthy();
    for (const a of PLACE_AMENITIES) expect(AMENITY_ICON[a]).toBeTruthy();
  });

  it('builds feed query params from the chips', () => {
    expect(feedQueryParams(DEFAULT_FEED_FILTERS, TALLINN)).toEqual({ lat: TALLINN.lat, lng: TALLINN.lng, radiusKm: 15 });
    expect(feedQueryParams({ near: false, category: 'cafe', friends: true }, TALLINN)).toEqual({ category: 'cafe', scope: 'friends' });
  });

  it('category chips are exclusive and a second tap clears', () => {
    const cafe = toggleCategory(DEFAULT_FEED_FILTERS, 'cafe');
    expect(cafe.category).toBe('cafe');
    expect(toggleCategory(cafe, 'park').category).toBe('park');
    expect(toggleCategory(cafe, 'cafe').category).toBeNull();
  });

  it('amenity toggles keep the schema order and never duplicate', () => {
    let list = toggleAmenity([], 'terrace', PLACE_AMENITIES);
    list = toggleAmenity(list, 'dogs_inside', PLACE_AMENITIES);
    expect(list).toEqual(['dogs_inside', 'terrace']);
    expect(toggleAmenity(list, 'terrace', PLACE_AMENITIES)).toEqual(['dogs_inside']);
  });
});

describe('optimistic like / save', () => {
  const post = { id: 'a', liked: false, saved: false, likeCount: 2 } as PlacePost;
  const other = { id: 'b', liked: true, saved: true, likeCount: 5 } as PlacePost;

  it('toggles the heart and never goes below zero', () => {
    expect(toggledLike(post)).toEqual({ liked: true, likeCount: 3 });
    expect(toggledLike({ ...post, liked: true, likeCount: 0 })).toEqual({ liked: false, likeCount: 0 });
  });

  it('patches the post inside infinite lists and keeps other pages untouched', () => {
    const data = { pages: [{ items: [post], nextCursor: 'x' }, { items: [other], nextCursor: null }], pageParams: [null, 'x'] };
    const next = patchPostData(data, 'a', { saved: true });
    expect(next.pages[0]!.items[0]!.saved).toBe(true);
    expect(next.pages[1]).toBe(data.pages[1]);
  });

  it('returns the same object when the post is not cached there (no needless re-render)', () => {
    const data = { pages: [{ items: [other], nextCursor: null }], pageParams: [null] };
    expect(patchPostData(data, 'a', { saved: true })).toBe(data);
    expect(patchPostData(other, 'a', { saved: false })).toBe(other);
  });

  it('patches a single post (detail query)', () => {
    expect(patchPostData(post, 'a', { liked: true, likeCount: 3 })).toMatchObject({ liked: true, likeCount: 3 });
  });
});
