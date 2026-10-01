import type { Park, ParkDetail } from '@kapp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/lib/api';
import type { ParkFilters } from '@/state/park-filters';

/**
 * Park data hooks. Query keys are hierarchical (['parks', …]) so one invalidation of
 * ['parks'] refreshes every park view after a change.
 */
export const parkKeys = {
  all: ['parks'] as const,
  nearby: (origin: { lat: number; lng: number }, filters: ParkFilters) => ['parks', 'nearby', origin, filters] as const,
  detail: (parkId: string) => ['parks', 'detail', parkId] as const,
  favorites: ['parks', 'favorites'] as const,
};

export function useNearbyParks(origin: { lat: number; lng: number }, filters: ParkFilters) {
  return useQuery({
    queryKey: parkKeys.nearby(origin, filters),
    queryFn: () => {
      const params: Record<string, string | number> = { lat: origin.lat, lng: origin.lng, radiusKm: filters.radiusKm };
      // Only send flags that are on; "off" means "don't care" on the API.
      for (const key of ['fenced', 'smallDogArea', 'water', 'lighting'] as const) if (filters[key]) params[key] = 'true';
      return apiGet<Park[]>('/parks/nearby', params);
    },
    // Show the previous result while a new radius/filter loads, instead of an empty map.
    placeholderData: (previous) => previous,
  });
}

export function useParkDetail(parkId: string) {
  return useQuery({ queryKey: parkKeys.detail(parkId), queryFn: () => apiGet<ParkDetail>(`/parks/${parkId}`) });
}

export function useFavoriteParks() {
  return useQuery({ queryKey: parkKeys.favorites, queryFn: () => apiGet<Park[]>('/me/favorites') });
}

/**
 * Toggle with an optimistic update: the heart changes instantly and rolls back if the request
 * fails. PUT/DELETE are idempotent, so a retry after a timeout cannot double-add.
 */
export function useToggleFavorite(parkId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (favorite: boolean) => apiSend<void>(favorite ? 'PUT' : 'DELETE', `/me/favorites/${parkId}`),
    onMutate: async (favorite) => {
      await client.cancelQueries({ queryKey: parkKeys.detail(parkId) });
      const previous = client.getQueryData<ParkDetail>(parkKeys.detail(parkId));
      if (previous) client.setQueryData(parkKeys.detail(parkId), { ...previous, isFavorite: favorite });
      return { previous };
    },
    onError: (_error, _favorite, context) => {
      if (context?.previous) client.setQueryData(parkKeys.detail(parkId), context.previous);
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: parkKeys.detail(parkId) });
      client.invalidateQueries({ queryKey: parkKeys.favorites });
    },
  });
}
