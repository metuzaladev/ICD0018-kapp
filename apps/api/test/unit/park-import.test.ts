import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { describePark, isInEstonia, toParkRow, type SourcePark } from '../../src/db/park-import';

const base: SourcePark = {
  name: 'Keila koertepark',
  kind: 'dog_park',
  lat: 59.311583,
  lng: 24.427996,
  county: 'Harjumaa',
  address: 'Põhjakaare tn, 76608 Keila',
  size: 'medium',
  separateSmallDogs: true,
  surface: ['grass', 'sand'],
  parking: true,
  lighting: false,
  seating: true,
  wasteBins: true,
  bagDispenser: true,
  sourceUrl: 'https://koertepargid.ee/koertepark/keila-koertepark/',
};

describe('describePark', () => {
  it('writes a factual Estonian summary from the features', () => {
    expect(describePark(base)).toBe(
      'Keskmine park. Eraldi alad suurtele ja väikestele koertele. Pinnas: muru ja liiv. Parkimine, istumisala ja prügikastid koos korjekottidega.',
    );
  });

  it('describes a shared area and three surfaces', () => {
    expect(describePark({ ...base, separateSmallDogs: false, surface: ['grass', 'sand', 'wood_chips'], parking: false, seating: false, wasteBins: true, bagDispenser: false })).toBe(
      'Keskmine park. Ühine ala kõikidele koertele. Pinnas: muru, liiv ja hakkepuit. Prügikastid.',
    );
  });

  it('labels swimming spots', () => {
    expect(describePark({ ...base, kind: 'swimming' })).toBe('Koerte ujumiskoht.');
  });

  it('returns null for a map pin without details instead of guessing', () => {
    expect(
      describePark({ ...base, size: null, separateSmallDogs: null, surface: [], parking: null, lighting: null, seating: null, wasteBins: null, bagDispenser: null }),
    ).toBeNull();
  });
});

describe('toParkRow', () => {
  it('maps a dog park: fenced, small-dog area from the separation, approved', () => {
    expect(toParkRow(base)).toMatchObject({
      name: 'Keila koertepark',
      address: 'Põhjakaare tn, 76608 Keila',
      location: { x: 24.427996, y: 59.311583 },
      fenced: true,
      smallDogArea: true,
      water: false,
      lighting: false,
      status: 'approved',
    });
  });

  it('maps a swimming spot: water, not fenced', () => {
    expect(toParkRow({ ...base, kind: 'swimming' })).toMatchObject({ fenced: false, water: true });
  });

  it('treats unknown lighting and separation as not present', () => {
    expect(toParkRow({ ...base, lighting: null, separateSmallDogs: null })).toMatchObject({ lighting: false, smallDogArea: false });
  });
});

describe('isInEstonia', () => {
  it.each([
    [59.4372, 24.7536, true],
    [57.78, 26.04, true],
    [60.17, 24.94, false], // Helsinki
    [56.95, 24.1, false], // Riga
  ])('%f, %f → %s', (lat, lng, ok) => {
    expect(isInEstonia({ lat, lng })).toBe(ok);
  });
});

describe('data/koertepargid.json', () => {
  const data = JSON.parse(readFileSync(new URL('../../src/db/data/koertepargid.json', import.meta.url), 'utf8')) as { parks: SourcePark[] };

  it('has unique names and every place inside Estonia', () => {
    const names = data.parks.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(data.parks.filter((p) => !isInEstonia(p))).toEqual([]);
  });

  it('covers the whole country, not only Tallinn', () => {
    expect(data.parks.length).toBeGreaterThanOrEqual(70);
    expect(data.parks.some((p) => p.lat < 58.5)).toBe(true); // South Estonia (Tartu, Võru, Valga)
    expect(data.parks.some((p) => p.lng > 27.5)).toBe(true); // Ida-Virumaa (Narva)
  });

  it('keeps only facts — no copied description text', () => {
    for (const p of data.parks) expect(Object.keys(p)).not.toContain('description');
  });
});
