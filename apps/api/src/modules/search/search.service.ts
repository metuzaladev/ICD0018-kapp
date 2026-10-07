import { SEARCH_ADDRESS_LIMIT, type SearchQuery, type SearchResponse, type SearchResult } from '@kapp/shared';

import { withTimeout } from '../../lib/timeout';
import { haversineKm, type AddressLookup } from './address-lookup';
import type { SearchRepository } from './search.repository';

export interface SearchService {
  search(viewerId: string | undefined, query: SearchQuery): Promise<SearchResponse>;
}

/**
 * Map search (docs/19): the app's own places first (that is what people come to the app for),
 * then Estonian addresses. Both run in parallel; the address service is best-effort, so its
 * failure or slowness only drops the address half (`addressesAvailable: false`), while a database
 * failure is a real error (503 via withTimeout / the error handler).
 */
export function createSearchService({
  repository,
  addresses,
  timeoutMs,
}: {
  repository: SearchRepository;
  addresses: AddressLookup;
  timeoutMs: number;
}): SearchService {
  return {
    async search(viewerId, { q, lat, lng }) {
      const origin = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
      const [places, found] = await Promise.all([
        withTimeout(repository.places(viewerId, q, origin), timeoutMs, 'search.places'),
        addresses.search(q),
      ]);
      // An address that is one of our places (same name, within 150 m) is shown once, as the place.
      const addressResults: SearchResult[] = found.addresses
        .filter((a) => !places.some((p) => p.name.localeCompare(a.name, 'et', { sensitivity: 'base' }) === 0 && haversineKm(p, a) < 0.15))
        .map((a) => ({ ...a, distanceKm: origin ? Math.round(haversineKm(origin, a) * 10) / 10 : null }))
        .sort(byAddressRelevance)
        .slice(0, SEARCH_ADDRESS_LIMIT);
      return { results: [...places, ...addressResults], addressesAvailable: found.available };
    },
  };
}

/**
 * Towns, parishes and villages (In-ADS EHAK) first: typing "Tartu" means the town, wherever you are.
 * Then the nearest: "Kalamaja tn" in Kärdla is rarely what a Tallinn user means. Without an origin
 * In-ADS's own relevance order is kept (stable sort).
 */
export function byAddressRelevance(a: SearchResult, b: SearchResult): number {
  const settlement = (r: SearchResult) => (r.category === 'EHAK' ? 0 : 1);
  if (settlement(a) !== settlement(b)) return settlement(a) - settlement(b);
  if (a.distanceKm === null || b.distanceKm === null) return 0;
  return a.distanceKm - b.distanceKm;
}
