import type { Booking, BookingInput } from '@kapp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/lib/api';

import { notificationKeys } from './use-notifications';
import { serviceKeys } from './use-services';

/** "Minu broneeringud". A booking changes both the user's lists and the provider's free times. */
export const bookingKeys = {
  all: ['bookings'] as const,
  list: (scope: 'upcoming' | 'past') => ['bookings', scope] as const,
};

export function useBookings(scope: 'upcoming' | 'past') {
  return useQuery({ queryKey: bookingKeys.list(scope), queryFn: () => apiGet<Booking[]>('/me/bookings', { scope }) });
}

function useInvalidateBookings() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: bookingKeys.all });
    client.invalidateQueries({ queryKey: serviceKeys.all });
    // Booking and cancelling write a row into the activity feed.
    client.invalidateQueries({ queryKey: notificationKeys.all });
  };
}

export function useCreateBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (input: BookingInput) => apiSend<Booking>('POST', '/me/bookings', input),
    // Also on error: a 409 means the free times shown are out of date.
    onSettled: invalidate,
  });
}

export function useCancelBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (bookingId: string) => apiSend<Booking>('POST', `/me/bookings/${bookingId}/cancel`),
    onSettled: invalidate,
  });
}
