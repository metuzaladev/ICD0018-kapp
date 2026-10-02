import type { ProviderDetail, ProviderSummary, ServiceCategory, ServiceSlots } from '@kapp/shared';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/lib/api';

/**
 * The service catalogue (M6): providers, their services and free times. Free times change whenever
 * someone books, so they are cached briefly; bookings invalidate ['services', 'slots'].
 */
export const serviceKeys = {
  all: ['services'] as const,
  providers: (category: ServiceCategory | null, origin: { lat: number; lng: number }) => ['services', 'providers', category, origin] as const,
  provider: (providerId: string) => ['services', 'provider', providerId] as const,
  slots: (serviceId: string) => ['services', 'slots', serviceId] as const,
};

/** Days shown in the date picker: a week, like the plan-visit chips. */
export const SLOT_DAYS = 7;

export function useProviders(category: ServiceCategory | null, origin: { lat: number; lng: number }) {
  return useQuery({
    queryKey: serviceKeys.providers(category, origin),
    queryFn: () => {
      const params: Record<string, string | number> = { lat: origin.lat, lng: origin.lng };
      if (category) params.category = category;
      return apiGet<ProviderSummary[]>('/service-providers', params);
    },
    // Keep the previous list while another category loads, instead of flashing an empty screen.
    placeholderData: (previous) => previous,
  });
}

export function useProvider(providerId: string | undefined) {
  return useQuery({
    queryKey: serviceKeys.provider(providerId ?? ''),
    queryFn: () => apiGet<ProviderDetail>(`/service-providers/${providerId}`),
    enabled: Boolean(providerId),
  });
}

export function useServiceSlots(serviceId: string | undefined) {
  return useQuery({
    enabled: Boolean(serviceId),
    queryKey: serviceKeys.slots(serviceId ?? ''),
    queryFn: () => apiGet<ServiceSlots>(`/services/${serviceId}/slots`, { days: SLOT_DAYS }),
    // Someone else may book meanwhile; the server still has the final word (409 → refetch).
    staleTime: 30_000,
  });
}
