import type { Booking } from '@kapp/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import i18n from '@/i18n';
import { formatDateIn, formatTimeIn, priceLabel } from '@/lib/format';

/**
 * "teisipäev, 6. oktoober, 10.00–11.00" in the provider's zone. Uses the i18n instance directly:
 * passing the hook's `t` as a parameter type made TypeScript's key inference "excessively deep"
 * once the M9b keys grew the dictionary.
 */
export function bookingWhen(booking: Booking): string {
  return i18n.t('bookings.when', {
    date: formatDateIn(booking.startsAt, booking.timeZone),
    from: formatTimeIn(booking.startsAt, booking.timeZone),
    to: formatTimeIn(booking.endsAt, booking.timeZone),
  });
}

type BookingCardProps = {
  booking: Booking;
  /** Shown only while the server says the booking can still be cancelled. */
  onCancel?: () => void;
  cancelling?: boolean;
};

/** One booking in "Minu broneeringud" and on the success screen. */
export function BookingCard({ booking, onCancel, cancelling = false }: BookingCardProps) {
  const { t } = useTranslation();
  const c = useTheme();
  const dogs = booking.dogs.map((d) => d.name).join(', ');
  const statusColor = booking.status === 'cancelled' ? 'danger' : booking.status === 'confirmed' ? 'text' : 'muted';

  return (
    <ThemedView style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <ThemedText type="label" style={styles.flex}>
          {dogs ? t('booking.confirmed.card', { dogs, service: booking.service.name }) : booking.service.name}
        </ThemedText>
        <ThemedText type="caption" themeColor={statusColor}>
          {t(`bookings.status.${booking.status}`)}
        </ThemedText>
      </View>
      <ThemedText type="caption">{bookingWhen(booking)}</ThemedText>
      <ThemedText type="caption" themeColor="muted">
        {[booking.provider.name, booking.provider.address ?? booking.provider.area, priceLabel(booking.priceCents, booking.priceIsFrom)].join(' · ')}
      </ThemedText>
      {booking.note ? <ThemedText type="caption">{t('bookings.note', { note: booking.note })}</ThemedText> : null}
      {booking.status === 'confirmed' && onCancel ? (
        booking.cancellable ? (
          <>
            <ThemedText type="caption" themeColor="muted">
              {t('bookings.cancelUntil', {
                date: formatDateIn(booking.cancelUntil, booking.timeZone),
                time: formatTimeIn(booking.cancelUntil, booking.timeZone),
              })}
            </ThemedText>
            <Button label={t('bookings.cancel')} variant="tertiary" loading={cancelling} onPress={onCancel} />
          </>
        ) : (
          <ThemedText type="caption" themeColor="muted">
            {t('bookings.cancelClosed')}
          </ThemedText>
        )
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, gap: Spacing.one },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  flex: { flex: 1 },
});
