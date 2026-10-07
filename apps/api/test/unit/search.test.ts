import { SEARCH_ADDRESS_LIMIT, searchQuerySchema, type SearchResult } from '@kapp/shared';
import { describe, expect, it, vi } from 'vitest';

import { TimeoutError } from '../../src/lib/timeout';
import { createInAdsLookup, haversineKm, noAddressLookup, toAddressResult, zoomForAddressType, type InAdsAddress } from '../../src/modules/search/address-lookup';
import { containsPattern } from '../../src/modules/search/search.repository';
import { byAddressRelevance, createSearchService } from '../../src/modules/search/search.service';
import { mockSearchRepository } from '../helpers';

const kotzebue: InAdsAddress = {
  pikkaadress: 'Harju maakond, Tallinn, Põhja-Tallinna linnaosa, Kotzebue tn 9',
  aadresstekst: 'Kotzebue tn 9',
  liikVal: 'EHITISHOONE',
  viitepunkt_b: '59.442584',
  viitepunkt_l: '24.737219',
  asustusyksus: 'Põhja-Tallinna linnaosa',
  omavalitsus: 'Tallinn',
  maakond: 'Harju maakond',
};
const tartuTown: InAdsAddress = { pikkaadress: 'Tartu maakond, Tartu linn', aadresstekst: '', liikVal: 'EHAK', viitepunkt_b: '58.378', viitepunkt_l: '26.729', maakond: 'Tartu maakond' };

const place = (over: Partial<SearchResult> = {}): SearchResult => ({
  kind: 'park',
  id: 'p1',
  name: 'Politseiaia koertepark',
  subtitle: 'Tallinn, Kesklinn',
  category: 'park',
  lat: 59.4334,
  lng: 24.7609,
  zoom: 15,
  distanceKm: 0.7,
  ...over,
});
const address = (over: Partial<SearchResult> = {}): SearchResult => ({ ...place(), kind: 'address', id: null, category: 'TANAV', zoom: 15, distanceKm: null, ...over });

describe('searchQuerySchema', () => {
  it('trims the query and coerces the origin', () => {
    expect(searchQuerySchema.parse({ q: '  Kalamaja ', lat: '59.4', lng: '24.7' })).toEqual({ q: 'Kalamaja', lat: 59.4, lng: 24.7 });
  });

  it.each([
    ['a one-letter query', { q: 'x' }],
    ['spaces only', { q: '   ' }],
    ['a query over 80 characters', { q: 'a'.repeat(81) }],
    ['latitude without longitude', { q: 'park', lat: '59' }],
    ['an unknown parameter', { q: 'park', limit: '99' }],
    ['a missing query', {}],
    ['latitude out of range', { q: 'park', lat: '95', lng: '24' }],
  ])('rejects %s', (_name, input) => {
    expect(searchQuerySchema.safeParse(input).success).toBe(false);
  });
});

describe('zoomForAddressType', () => {
  it.each([
    ['EHITISHOONE', 17],
    ['KATASTRIYKSUS', 17],
    ['TANAV', 15],
    ['EHAK', 12],
    ['VAIKEKOHT', 14],
    [undefined, 14],
  ])('%s → %i', (type, zoom) => {
    expect(zoomForAddressType(type)).toBe(zoom);
  });
});

describe('toAddressResult', () => {
  it('maps a building: short address as the name, where it is as the subtitle', () => {
    expect(toAddressResult(kotzebue)).toEqual({
      kind: 'address',
      id: null,
      name: 'Kotzebue tn 9',
      subtitle: 'Põhja-Tallinna linnaosa, Tallinn',
      category: 'EHITISHOONE',
      lat: 59.442584,
      lng: 24.737219,
      zoom: 17,
      distanceKm: null,
    });
  });

  it('uses the last part of the long address when there is no short one (towns)', () => {
    expect(toAddressResult(tartuTown)).toMatchObject({ name: 'Tartu linn', subtitle: 'Tartu maakond', zoom: 12 });
  });

  it('does not repeat the name in the subtitle', () => {
    expect(toAddressResult({ ...tartuTown, pikkaadress: 'Tartu maakond', maakond: 'Tartu maakond' })?.subtitle).toBeNull();
  });

  it('adds the distance when an origin is given', () => {
    expect(toAddressResult(kotzebue, { lat: 59.437, lng: 24.7536 })?.distanceKm).toBeCloseTo(1.1, 1);
  });

  it.each([
    ['no coordinates', { ...kotzebue, viitepunkt_b: undefined }],
    ['coordinates that are not numbers', { ...kotzebue, viitepunkt_l: 'abc' }],
    ['zero coordinates', { ...kotzebue, viitepunkt_b: '0', viitepunkt_l: '0' }],
    ['no name at all', { ...kotzebue, aadresstekst: '', pikkaadress: '' }],
  ])('skips a row with %s', (_name, row) => {
    expect(toAddressResult(row)).toBeNull();
  });
});

describe('haversineKm', () => {
  it('is zero for the same point and ~180 km Tallinn–Tartu', () => {
    expect(haversineKm({ lat: 59.437, lng: 24.7536 }, { lat: 59.437, lng: 24.7536 })).toBe(0);
    expect(haversineKm({ lat: 59.437, lng: 24.7536 }, { lat: 58.378, lng: 26.729 })).toBeCloseTo(163, 0);
  });
});

describe('containsPattern', () => {
  it('wraps the query and escapes LIKE wildcards', () => {
    expect(containsPattern(' Kalamaja ')).toBe('%Kalamaja%');
    expect(containsPattern('100%_park\\')).toBe('%100\\%\\_park\\\\%');
  });
});

describe('createInAdsLookup', () => {
  const ok = (rows: InAdsAddress[]) => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ addresses: rows }) }));

  it('asks In-ADS with the encoded query and maps the rows', async () => {
    const fetchFn = ok([kotzebue]);
    const lookup = createInAdsLookup({ baseUrl: 'https://ads.test/gazetteer', timeoutMs: 1000, fetchFn });
    const res = await lookup.search('Kotzebue 9');
    expect(res.available).toBe(true);
    expect(res.addresses.map((a) => a.name)).toEqual(['Kotzebue tn 9']);
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe(`https://ads.test/gazetteer?address=Kotzebue%209&results=${SEARCH_ADDRESS_LIMIT * 2}&appartment=0`);
  });

  it('caches the same query (case and spaces ignored) for the TTL', async () => {
    let t = 0;
    const fetchFn = ok([kotzebue]);
    const lookup = createInAdsLookup({ baseUrl: 'https://ads.test/g', timeoutMs: 1000, fetchFn, cacheTtlMs: 1000, now: () => t });
    await lookup.search('Kotzebue 9');
    await lookup.search(' kotzebue 9 ');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    t = 1001;
    await lookup.search('Kotzebue 9');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('keeps the cache bounded', async () => {
    const fetchFn = ok([kotzebue]);
    const lookup = createInAdsLookup({ baseUrl: 'https://ads.test/g', timeoutMs: 1000, fetchFn, cacheMax: 2 });
    await lookup.search('aa');
    await lookup.search('bb');
    await lookup.search('cc'); // evicts "aa"
    await lookup.search('aa');
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('drops duplicate rows (same name and place)', async () => {
    const lookup = createInAdsLookup({ baseUrl: 'https://ads.test/g', timeoutMs: 1000, fetchFn: ok([kotzebue, kotzebue, tartuTown]) });
    expect((await lookup.search('x')).addresses).toHaveLength(2);
  });

  it.each([
    ['an HTTP error', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))],
    ['a network error', vi.fn(async () => Promise.reject(new TypeError('fetch failed')))],
    ['a timeout', vi.fn(async () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')))],
  ])('reports unavailable (not an exception) on %s', async (_name, fetchFn) => {
    const onError = vi.fn();
    const lookup = createInAdsLookup({ baseUrl: 'https://ads.test/g', timeoutMs: 1000, fetchFn, onError });
    await expect(lookup.search('Kalamaja')).resolves.toEqual({ addresses: [], available: false });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure', async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue({ ok: true, status: 200, json: async () => ({ addresses: [kotzebue] }) });
    const lookup = createInAdsLookup({ baseUrl: 'https://ads.test/g', timeoutMs: 1000, fetchFn });
    expect((await lookup.search('Kotzebue')).available).toBe(false);
    expect((await lookup.search('Kotzebue')).addresses).toHaveLength(1);
  });

  it('treats a body without an address list as no results', async () => {
    const lookup = createInAdsLookup({ baseUrl: 'https://ads.test/g', timeoutMs: 1000, fetchFn: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })) });
    await expect(lookup.search('Kalamaja')).resolves.toEqual({ addresses: [], available: true });
  });

  it('reports a malformed body (null) as unavailable', async () => {
    const lookup = createInAdsLookup({ baseUrl: 'https://ads.test/g', timeoutMs: 1000, fetchFn: vi.fn(async () => ({ ok: true, status: 200, json: async () => null })) });
    await expect(lookup.search('Kalamaja')).resolves.toEqual({ addresses: [], available: false });
  });
});

describe('byAddressRelevance', () => {
  it('puts towns and parishes first, then the nearest', () => {
    const list = [address({ name: 'far street', distanceKm: 120 }), address({ name: 'Tartu linn', category: 'EHAK', distanceKm: 163 }), address({ name: 'near street', distanceKm: 2 })];
    expect([...list].sort(byAddressRelevance).map((a) => a.name)).toEqual(['Tartu linn', 'near street', 'far street']);
  });

  it('keeps the original order without distances', () => {
    const list = [address({ name: 'b' }), address({ name: 'a' })];
    expect([...list].sort(byAddressRelevance).map((a) => a.name)).toEqual(['b', 'a']);
  });
});

describe('search service', () => {
  const origin = { lat: 59.437, lng: 24.7536 };

  it('returns places first, then addresses, and passes the viewer and origin to the repository', async () => {
    const repository = mockSearchRepository();
    repository.places.mockResolvedValue([place()]);
    const addresses = { search: vi.fn(async () => ({ addresses: [address({ name: 'Kotzebue tn 9', lat: 59.4426, lng: 24.7372 })], available: true })) };
    const service = createSearchService({ repository, addresses, timeoutMs: 1000 });
    const res = await service.search('u1', { q: 'park', ...origin });
    expect(res.results.map((r) => r.kind)).toEqual(['park', 'address']);
    expect(res.results[1]!.distanceKm).toBeCloseTo(1.1, 1);
    expect(res.addressesAvailable).toBe(true);
    expect(repository.places).toHaveBeenCalledWith('u1', 'park', origin);
  });

  it('shows an address that is one of our places only once (same name, within 150 m)', async () => {
    const repository = mockSearchRepository();
    repository.places.mockResolvedValue([place({ name: 'Käpakoda', kind: 'provider' })]);
    const addresses = { search: vi.fn(async () => ({ addresses: [address({ name: 'käpakoda', lat: 59.4335, lng: 24.761 }), address({ name: 'Käpakoda', lat: 59.5, lng: 25.0 })], available: true })) };
    const res = await createSearchService({ repository, addresses, timeoutMs: 1000 }).search(undefined, { q: 'käpa' });
    expect(res.results.map((r) => `${r.kind}:${r.lat}`)).toEqual(['provider:59.4334', 'address:59.5']);
  });

  it(`keeps at most ${SEARCH_ADDRESS_LIMIT} addresses after sorting`, async () => {
    const repository = mockSearchRepository();
    repository.places.mockResolvedValue([]);
    const many = Array.from({ length: 8 }, (_, i) => address({ name: `street ${i}`, lat: 59.437 + (8 - i) * 0.01, lng: 24.7536 }));
    const res = await createSearchService({ repository, addresses: { search: async () => ({ addresses: many, available: true }) }, timeoutMs: 1000 }).search(undefined, { q: 'street', ...origin });
    expect(res.results.map((r) => r.name)).toEqual(['street 7', 'street 6', 'street 5', 'street 4']);
  });

  it('still answers with places when the address service is down', async () => {
    const repository = mockSearchRepository();
    repository.places.mockResolvedValue([place()]);
    const res = await createSearchService({ repository, addresses: { search: async () => ({ addresses: [], available: false }) }, timeoutMs: 1000 }).search(undefined, { q: 'park' });
    expect(res).toEqual({ results: [place()], addressesAvailable: false });
  });

  it('works without an address service (tests, ADDRESS_SEARCH_ENABLED=false)', async () => {
    const repository = mockSearchRepository();
    repository.places.mockResolvedValue([]);
    await expect(createSearchService({ repository, addresses: noAddressLookup, timeoutMs: 1000 }).search(undefined, { q: 'park' })).resolves.toEqual({ results: [], addressesAvailable: true });
  });

  it('times out on a slow database (TimeoutError → 503)', async () => {
    vi.useFakeTimers();
    try {
      const repository = mockSearchRepository();
      repository.places.mockReturnValue(new Promise(() => {}));
      const pending = createSearchService({ repository, addresses: noAddressLookup, timeoutMs: 500 }).search(undefined, { q: 'park' });
      const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError);
      await vi.advanceTimersByTimeAsync(500);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes a database error through', async () => {
    const repository = mockSearchRepository();
    repository.places.mockRejectedValue(new Error('connection refused'));
    await expect(createSearchService({ repository, addresses: noAddressLookup, timeoutMs: 1000 }).search(undefined, { q: 'park' })).rejects.toThrow('connection refused');
  });
});
