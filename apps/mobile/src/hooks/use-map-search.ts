import type { SearchResponse } from '@kapp/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { apiGet } from '@/lib/api';
import { SEARCH_DEBOUNCE_MS, searchableQuery } from '@/lib/map-search';

/** The value after it has stopped changing for `ms` (typing pauses). */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * Suggestions for the Kaart search field (GET /search, docs/19): parks, services, community picks and
 * Estonian addresses. Debounced so typing "Kalamaja" is one request, not eight; the origin (the map
 * centre, rounded like every location we send) sorts nearer places first. The previous list stays
 * while the next one loads, so the dropdown does not flicker between keystrokes.
 */
export function useMapSearch(text: string, origin: { lat: number; lng: number } | null) {
  const q = searchableQuery(useDebouncedValue(text, SEARCH_DEBOUNCE_MS));
  const lat = origin ? Math.round(origin.lat * 1000) / 1000 : null;
  const lng = origin ? Math.round(origin.lng * 1000) / 1000 : null;
  return useQuery({
    queryKey: ['map-search', q, lat, lng] as const,
    queryFn: () => apiGet<SearchResponse>('/search', lat !== null && lng !== null ? { q: q!, lat, lng } : { q: q! }),
    enabled: q !== null,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}
