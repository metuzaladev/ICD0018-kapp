import type { Booking } from '@kapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { bookingWhen, BookingCard } from '@/components/booking-card';
import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FormError } from '@/components/form-error';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useBookings, useCancelBooking } from '@/hooks/use-bookings';
import { useMyDogs } from '@/hooks/use-dogs';
import { errorMessage } from '@/lib/api';

type Scope = 'upcoming' | 'past';
const SCOPES: Scope[] = ['upcoming', 'past'];

/** Figma 06 / Bookings / My Bookings: "Tulevased" / "Varasemad", cancel with a confirmation. */
export default function BookingsScreen() {
  const { t } = useTranslation();
  const [scope, setScope] = useState<Scope>('upcoming');
  const list = useBookings(scope);
  const cancel = useCancelBooking();
  const dogCount = useMyDogs().data?.length ?? 0;

  function confirmCancel(booking: Booking) {
    // Destructive and not undoable (the time may be booked by someone else), so ask first (HIG).
    Alert.alert(
      t('bookings.cancelTitle'),
      t('bookings.cancelBody', { service: booking.service.name, provider: booking.provider.name, when: bookingWhen(t, booking) }),
      [
        { text: t('bookings.keep'), style: 'cancel' },
        { text: t('bookings.cancelConfirm'), style: 'destructive', onPress: () => cancel.mutate(booking.id) },
      ],
    );
  }

  return (
    <Screen underHeader title={t('bookings.title')} subtitle={t('bookings.subtitle', { count: dogCount })}>
      <OfflineBanner />
      <View style={styles.chips}>
        {SCOPES.map((s) => (
          <Chip key={s} label={t(`bookings.${s}`)} selected={scope === s} onPress={() => setScope(s)} />
        ))}
      </View>
      {list.error && !list.data ? <FormError message={errorMessage(list.error)} /> : null}
      {cancel.error ? <FormError message={errorMessage(cancel.error)} /> : null}
      {list.isPending ? <ThemedText themeColor="muted">{t('common.loading')}</ThemedText> : null}
      {list.data?.length === 0 ? (
        <ThemedText themeColor="muted">{t(scope === 'upcoming' ? 'bookings.emptyUpcoming' : 'bookings.emptyPast')}</ThemedText>
      ) : null}
      {list.data?.map((booking) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          onCancel={() => confirmCancel(booking)}
          cancelling={cancel.isPending && cancel.variables === booking.id}
        />
      ))}
      <Button label={t('bookings.findService')} variant="secondary" onPress={() => router.push('/services')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: Spacing.two },
});
