import { SEARCH_ADDRESS_LIMIT, type SearchResult } from '@kapp/shared';

/**
 * Estonian address search for the map (docs/19): the Land Board's In-ADS gazetteer
 * (https://inaadress.maaamet.ee/inaadress/gazetteer). Why In-ADS and not Nominatim or Photon:
 * it is the official address register, free, needs no key, knows every Estonian house, street,
 * village and cadastral unit, and its usage terms allow type-ahead (Nominatim's do not).
 *
 * The API proxies it instead of the app calling it directly: one place for the timeout, a small
 * cache and a rate limit, and the app does not depend on a third-party URL (docs/06).
 */

export type AddressLookupResult = { addresses: SearchResult[]; available: boolean };

export interface AddressLookup {
  search(query: string): Promise<AddressLookupResult>;
}

/** Tests, seeds and `ADDRESS_SEARCH_ENABLED=false`: no addresses, but nothing is "down" either. */
export const noAddressLookup: AddressLookup = { search: async () => ({ addresses: [], available: true }) };

/** The fields we read from an In-ADS gazetteer row (the response has many more). */
export type InAdsAddress = {
  pikkaadress?: string;
  aadresstekst?: string;
  liikVal?: string;
  viitepunkt_b?: string;
  viitepunkt_l?: string;
  omavalitsus?: string;
  asustusyksus?: string;
  maakond?: string;
};

/**
 * Camera zoom per address type: a building is framed closely, a street less, a town or parish from
 * further out. In-ADS type codes: EHITISHOONE (building), KATASTRIYKSUS (land parcel), TANAV (street),
 * EHAK (administrative unit: county, municipality, settlement), others (e.g. VAIKEKOHT).
 */
export function zoomForAddressType(type: string | undefined): number {
  switch (type) {
    case 'EHITISHOONE':
    case 'KATASTRIYKSUS':
      return 17;
    case 'TANAV':
      return 15;
    case 'EHAK':
      return 12;
    default:
      return 14;
  }
}

/**
 * One In-ADS row → a search result, or null when it has no usable point. The name is the short
 * address ("Kotzebue tn 9"); EHAK rows have none, so the last part of the long address is used
 * ("Tartu linn"). The subtitle names where it is, without repeating the name.
 */
export function toAddressResult(row: InAdsAddress, origin?: { lat: number; lng: number }): SearchResult | null {
  const lat = Number(row.viitepunkt_b);
  const lng = Number(row.viitepunkt_l);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return null;
  const parts = (row.pikkaadress ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const name = row.aadresstekst?.trim() || parts[parts.length - 1] || '';
  if (!name) return null;
  const where = [row.asustusyksus, row.omavalitsus, row.maakond].map((s) => s?.trim()).filter((s): s is string => Boolean(s) && s !== name);
  return {
    kind: 'address',
    id: null,
    name,
    subtitle: where.slice(0, 2).join(', ') || null,
    category: row.liikVal ?? null,
    lat,
    lng,
    zoom: zoomForAddressType(row.liikVal),
    distanceKm: origin ? Math.round(haversineKm(origin, { lat, lng }) * 10) / 10 : null,
  };
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

type Fetch = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * In-ADS client with a timeout and a small in-memory cache (same query within 10 minutes = one
 * call; type-ahead repeats prefixes a lot). A slow or failing service never fails the search:
 * the result is `available: false` and the app shows the app's own places only.
 */
export function createInAdsLookup({
  baseUrl,
  timeoutMs,
  fetchFn = fetch as unknown as Fetch,
  cacheTtlMs = 10 * 60_000,
  cacheMax = 500,
  now = () => Date.now(),
  onError,
}: {
  baseUrl: string;
  timeoutMs: number;
  fetchFn?: Fetch;
  cacheTtlMs?: number;
  cacheMax?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
}): AddressLookup {
  const cache = new Map<string, { at: number; rows: InAdsAddress[] }>();
  return {
    async search(query) {
      const key = query.trim().toLocaleLowerCase('et');
      const hit = cache.get(key);
      if (hit && now() - hit.at < cacheTtlMs) return { addresses: rowsToResults(hit.rows), available: true };
      const url = `${baseUrl}?address=${encodeURIComponent(query.trim())}&results=${SEARCH_ADDRESS_LIMIT * 2}&appartment=0`;
      try {
        const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error(`In-ADS responded ${response.status}`);
        const body = (await response.json()) as { addresses?: unknown };
        const rows = Array.isArray(body.addresses) ? (body.addresses as InAdsAddress[]) : [];
        if (cache.size >= cacheMax) cache.delete(cache.keys().next().value as string);
        cache.set(key, { at: now(), rows });
        return { addresses: rowsToResults(rows), available: true };
      } catch (error) {
        onError?.(error);
        return { addresses: [], available: false };
      }
    },
  };
}

/** Usable rows only, duplicates (same name and place) once. The service sorts and keeps SEARCH_ADDRESS_LIMIT. */
function rowsToResults(rows: InAdsAddress[]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const row of rows) {
    const result = toAddressResult(row);
    if (!result) continue;
    const key = `${result.name}|${result.subtitle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(result);
    if (out.length === SEARCH_ADDRESS_LIMIT * 2) break;
  }
  return out;
}
