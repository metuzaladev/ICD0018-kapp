import type { Booking, BookingWithDiscount, BookingWithRedemptionInput } from '@kapp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/lib/api';

import { notificationKeys } from './use-notifications';
import { rewardKeys } from './use-rewards';
import { serviceKeys } from './use-services';
import { shopKeys } from './use-shop';

/** "Minu broneeringud". A booking changes both the user's lists and the provider's free times. */
const bookingKeys = {
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
    // A paw-discount code is marked used by a booking and released by its cancellation (M9b).
    client.invalidateQueries({ queryKey: shopKeys.redemptions });
    client.invalidateQueries({ queryKey: rewardKeys.all });
  };
}

export function useCreateBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    // Optional `redemptionId` (M9b "Kasuta käppi"): the answer carries the discount, still no payment.
    mutationFn: (input: BookingWithRedemptionInput) => apiSend<BookingWithDiscount>('POST', '/me/bookings', input),
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
