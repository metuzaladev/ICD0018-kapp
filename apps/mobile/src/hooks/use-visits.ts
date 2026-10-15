import type {
  ActiveCheckIn,
  CheckInInput,
  ParkReportInput,
  ParkVisitors,
  PlannedVisit,
  PlannedVisitInput,
  Review,
  ReviewInput,
  VisitHistoryItem,
} from '@kapp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/lib/api';

import { parkKeys } from './use-parks';

/**
 * Visit data (check-ins, visitors, history, plans) and park feedback (reviews, reports).
 * Everything that changes who is in a park also invalidates ['parks'], because park lists and
 * markers show the "koera praegu" counter.
 */
const visitKeys = {
  all: ['visits'] as const,
  active: ['visits', 'active'] as const,
  history: ['visits', 'history'] as const,
  plans: ['visits', 'plans'] as const,
  visitors: (parkId: string) => ['visits', 'visitors', parkId] as const,
};
const reviewKeys = { park: (parkId: string) => ['parks', 'reviews', parkId] as const };

export function useActiveCheckIn() {
  return useQuery({ queryKey: visitKeys.active, queryFn: () => apiGet<ActiveCheckIn | null>('/me/check-ins/active') });
}

export function useParkVisitors(parkId: string, enabled = true) {
  return useQuery({
    queryKey: visitKeys.visitors(parkId),
    queryFn: () => apiGet<ParkVisitors>(`/parks/${parkId}/visitors`),
    enabled,
    // People come and go; refresh more often than static park data.
    staleTime: 30_000,
  });
}

export function useVisitHistory() {
  return useQuery({ queryKey: visitKeys.history, queryFn: () => apiGet<VisitHistoryItem[]>('/me/visits') });
}

export function usePlannedVisits() {
  return useQuery({ queryKey: visitKeys.plans, queryFn: () => apiGet<PlannedVisit[]>('/me/planned-visits') });
}

export function useParkReviews(parkId: string) {
  return useQuery({ queryKey: reviewKeys.park(parkId), queryFn: () => apiGet<Review[]>(`/parks/${parkId}/reviews`) });
}

function useInvalidatePresence() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: visitKeys.all });
    client.invalidateQueries({ queryKey: parkKeys.all });
  };
}

export function useCheckIn() {
  const invalidate = useInvalidatePresence();
  return useMutation({
    mutationFn: (input: CheckInInput) => apiSend<ActiveCheckIn>('POST', '/me/check-ins', input),
    onSuccess: invalidate,
  });
}

export function useEndCheckIn() {
  const invalidate = useInvalidatePresence();
  return useMutation({
    mutationFn: (checkInId: string) => apiSend<void>('POST', `/me/check-ins/${checkInId}/end`),
    onSuccess: invalidate,
  });
}

export function usePlanVisit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PlannedVisitInput) => apiSend<PlannedVisit>('POST', '/me/planned-visits', input),
    onSuccess: () => client.invalidateQueries({ queryKey: visitKeys.plans }),
  });
}

export function useCancelPlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => apiSend<void>('DELETE', `/me/planned-visits/${planId}`),
    onSuccess: () => client.invalidateQueries({ queryKey: visitKeys.plans }),
  });
}

export function useSubmitReview(parkId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) => apiSend<Review>('PUT', `/parks/${parkId}/reviews/mine`, input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: reviewKeys.park(parkId) });
      client.invalidateQueries({ queryKey: parkKeys.detail(parkId) });
      client.invalidateQueries({ queryKey: visitKeys.history });
    },
  });
}

export function useReportPark(parkId: string) {
  return useMutation({
    mutationFn: (input: ParkReportInput) => apiSend<{ id: string }>('POST', `/parks/${parkId}/reports`, input),
  });
}
