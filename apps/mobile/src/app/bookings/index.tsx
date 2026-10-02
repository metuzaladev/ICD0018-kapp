import type { Booking } from '@kapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { bookingWhen, BookingCard } from '@/components/booking-card';
import { Button } from '@/components/button';
import { SegmentedControl } from '@/components/segmented-control';
import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { FormError } from '@/components/form-error';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { useBookings, useCancelBooking } from '@/hooks/use-bookings';
import { useMyDogs } from '@/hooks/use-dogs';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { errorMessage } from '@/lib/api';
import { haptic } from '@/lib/haptics';

type Scope = 'upcoming' | 'past';

/** Figma 06 / Bookings / My Bookings: "Tulevased" / "Varasemad", cancel with a confirmation. */
export default function BookingsScreen() {
  const { t } = useTranslation();
  const [scope, setScope] = useState<Scope>('upcoming');
  const list = useBookings(scope);
  const cancel = useCancelBooking();
  const dogCount = useMyDogs().data?.length ?? 0;
  const refresh = usePullToRefresh(list.refetch);

  function confirmCancel(booking: Booking) {
    // Destructive and not undoable (the time may be booked by someone else), so ask first (HIG).
    haptic('warning');
    Alert.alert(
      t('bookings.cancelTitle'),
      t('bookings.cancelBody', { service: booking.service.name, provider: booking.provider.name, when: bookingWhen(booking) }),
      [
        { text: t('bookings.keep'), style: 'cancel' },
        { text: t('bookings.cancelConfirm'), style: 'destructive', onPress: () => cancel.mutate(booking.id) },
      ],
    );
  }

  return (
    <Screen underHeader title={t('bookings.title')} subtitle={t('bookings.subtitle', { count: dogCount })} refresh={refresh}>
      <OfflineBanner />
      <SegmentedControl
        options={[
          { value: 'upcoming', label: t('bookings.upcoming') },
          { value: 'past', label: t('bookings.past') },
        ]}
        value={scope}
        onChange={(next) => next && setScope(next)}
      />
      {list.error && !list.data ? <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} retrying={list.isFetching} /> : null}
      {cancel.error ? <FormError message={errorMessage(cancel.error)} /> : null}
      {list.isPending ? <SkeletonList rows={2} rowHeight={96} /> : null}
      {list.data?.length === 0 ? <EmptyState title={t(scope === 'upcoming' ? 'bookings.emptyUpcoming' : 'bookings.emptyPast')} /> : null}
      {list.data?.map((booking, i) => (
        <Entering key={booking.id} index={i}>
          <BookingCard booking={booking} onCancel={() => confirmCancel(booking)} cancelling={cancel.isPending && cancel.variables === booking.id} />
        </Entering>
      ))}
      <Button label={t('bookings.findService')} variant="secondary" onPress={() => router.push('/services')} />
    </Screen>
  );
}
