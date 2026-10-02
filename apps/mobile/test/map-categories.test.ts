import { describe, expect, it } from 'vitest';

import {
  AVAILABLE_CATEGORIES,
  CATEGORY_ICON,
  categoryOf,
  categoryShows,
  MAP_CATEGORIES,
  MAX_PIN_FACES,
  needsProviders,
  parkPinModel,
  PLACE_ICON,
  providerPlaceKind,
} from '@/lib/map-categories';

describe('map categories', () => {
  it('offers only categories backed by data (cafés and beaches wait for M9b)', () => {
    expect(AVAILABLE_CATEGORIES).toEqual(['all', 'parks', 'services', 'vets']);
    expect(AVAILABLE_CATEGORIES.every((c) => MAP_CATEGORIES.includes(c))).toBe(true);
  });

  it('has an icon for every category and place kind (Figma Chip / Icon, Map Pin / Place)', () => {
    expect(CATEGORY_ICON).toMatchObject({ all: 'layers', parks: 'trees', cafes: 'coffee', services: 'scissors', beaches: 'waves', vets: 'stethoscope' });
    expect(PLACE_ICON).toMatchObject({ park: 'trees', cafe: 'coffee', beach: 'waves', service: 'scissors', vet: 'stethoscope' });
  });

  it('maps provider categories: clinics are vets, everything else a service', () => {
    expect(providerPlaceKind('vet')).toBe('vet');
    expect(providerPlaceKind('grooming')).toBe('service');
    expect(providerPlaceKind('training')).toBe('service');
    expect(providerPlaceKind('other')).toBe('service');
  });

  it('assigns every place kind to one chip', () => {
    expect(categoryOf('park')).toBe('parks');
    expect(categoryOf('cafe')).toBe('cafes');
    expect(categoryOf('beach')).toBe('beaches');
    expect(categoryOf('service')).toBe('services');
    expect(categoryOf('vet')).toBe('vets');
  });

  it('"Kõik" shows everything, a chip only its own kind', () => {
    expect(categoryShows('all', 'park')).toBe(true);
    expect(categoryShows('all', 'vet')).toBe(true);
    expect(categoryShows('parks', 'park')).toBe(true);
    expect(categoryShows('parks', 'service')).toBe(false);
    expect(categoryShows('vets', 'vet')).toBe(true);
    expect(categoryShows('vets', 'service')).toBe(false);
    expect(categoryShows('services', 'service')).toBe(true);
  });

  it('requests providers only when they can be shown', () => {
    expect(needsProviders('all')).toBe(true);
    expect(needsProviders('services')).toBe(true);
    expect(needsProviders('vets')).toBe(true);
    expect(needsProviders('parks')).toBe(false);
  });
});

describe('park pin model', () => {
  it('a quiet park (or unknown count) is a park place pin', () => {
    expect(parkPinModel(0)).toEqual({ kind: 'place' });
    expect(parkPinModel(undefined)).toEqual({ kind: 'place' });
  });

  it('one dog is a single face without a count pill (Figma Type=Single)', () => {
    expect(parkPinModel(1)).toEqual({ kind: 'dogs', faces: 1, showCount: false, count: 1 });
  });

  it('a group shows up to three faces and the "N koera" pill', () => {
    expect(parkPinModel(2)).toEqual({ kind: 'dogs', faces: 2, showCount: true, count: 2 });
    expect(parkPinModel(6)).toEqual({ kind: 'dogs', faces: MAX_PIN_FACES, showCount: true, count: 6 });
  });

  it('guards against bad counts', () => {
    expect(parkPinModel(-3)).toEqual({ kind: 'place' });
    expect(parkPinModel(2.7)).toEqual({ kind: 'dogs', faces: 2, showCount: true, count: 2 });
  });
});
