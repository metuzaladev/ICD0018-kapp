import { describe, expect, it } from 'vitest';

import { MAX_ZOOM, MIN_ZOOM, searchableQuery, searchResultIcon, searchResultRoute, stepZoom } from '@/lib/map-search';

describe('searchableQuery', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['k', null],
    [' ka ', 'ka'],
    ['Kotzebue 9', 'Kotzebue 9'],
  ])('%j → %j', (text, expected) => {
    expect(searchableQuery(text)).toBe(expected);
  });
});

describe('stepZoom', () => {
  it('zooms one whole level per tap', () => {
    expect(stepZoom(12, 1)).toBe(13);
    expect(stepZoom(12, -1)).toBe(11);
  });

  it('snaps a pinched (fractional) zoom to the next whole level in the tapped direction', () => {
    expect(stepZoom(12.4, 1)).toBe(13);
    expect(stepZoom(12.4, -1)).toBe(12);
    expect(stepZoom(12.9999999, 1)).toBe(14); // 12.9999999 is level 13 after float noise
  });

  it(`stays within ${MIN_ZOOM}–${MAX_ZOOM}`, () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
    expect(stepZoom(30, -1)).toBe(MAX_ZOOM);
    expect(stepZoom(2, 1)).toBe(MIN_ZOOM);
  });
});

describe('searchResultIcon', () => {
  it.each([
    [{ kind: 'park', category: 'park' }, 'trees'],
    [{ kind: 'park', category: 'beach' }, 'waves'],
    [{ kind: 'provider', category: 'vet' }, 'stethoscope'],
    [{ kind: 'provider', category: 'grooming' }, 'scissors'],
    [{ kind: 'post', category: 'cafe' }, 'coffee'],
    [{ kind: 'post', category: 'beach' }, 'waves'],
    [{ kind: 'post', category: 'park' }, 'trees'],
    [{ kind: 'post', category: 'shop' }, 'store'],
    [{ kind: 'post', category: null }, 'store'],
    [{ kind: 'address', category: 'EHITISHOONE' }, 'map-pin'],
  ] as const)('%o → %s', (result, icon) => {
    expect(searchResultIcon(result)).toBe(icon);
  });
});

describe('searchResultRoute', () => {
  it('leads parks, providers and community picks to their page', () => {
    expect(searchResultRoute({ kind: 'park', id: 'p1' })).toEqual({ pathname: '/parks/[parkId]', params: { parkId: 'p1' } });
    expect(searchResultRoute({ kind: 'provider', id: 's1' })).toEqual({ pathname: '/services/[providerId]', params: { providerId: 's1' } });
    expect(searchResultRoute({ kind: 'post', id: 'x1' })).toEqual({ pathname: '/place-posts/[postId]', params: { postId: 'x1' } });
  });

  it('has no page for an address or a result without id', () => {
    expect(searchResultRoute({ kind: 'address', id: null })).toBeNull();
    expect(searchResultRoute({ kind: 'park', id: null })).toBeNull();
  });
});
