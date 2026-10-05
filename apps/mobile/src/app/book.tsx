import { BOOKING_CUTOFF_MINUTES, BOOKING_NOTE_MAX, bookingWithRedemptionInputSchema, MAX_BOOKING_DOGS, type BookingWithDiscount } from '@kapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { BookingCard } from '@/components/booking-card';
import { Button } from '@/components/button';
import { ChipRow, IconChip } from '@/components/icon-chip';
import { Entering } from '@/components/entering';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { SlotPicker } from '@/components/slot-picker';
import { SuccessMark } from '@/components/success-mark';
import { SwitchRow } from '@/components/switch-row';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useCreateBooking } from '@/hooks/use-bookings';
import { useMyDogs } from '@/hooks/use-dogs';
import { usePointsBalance } from '@/hooks/use-points';
import { useRedeemOnce } from '@/hooks/use-redeem-once';
import { useProvider, useServiceSlots } from '@/hooks/use-services';
import { useRedemptions, useShop } from '@/hooks/use-shop';
import { errorMessage } from '@/lib/api';
import { formatDuration, formatPrice, pawsLabel, priceLabel } from '@/lib/format';
import { validateForm } from '@/lib/form';
import { haptic } from '@/lib/haptics';

/** The phone's zone; times are shown in the provider's, and we say so only when the two differ. */
const DEVICE_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** After booking: Figma 06 / Booking / Confirmed — success mark, "Kohtumiseni!", the booking card. */
function Confirmed({ booking }: { booking: BookingWithDiscount }) {
  const { t } = useTranslation();
  return (
    <Screen underHeader>
      <SuccessMark />
      <ThemedText type="title" accessibilityRole="header">
        {t('booking.confirmed.title')}
      </ThemedText>
      <ThemedText themeColor="muted">{t('booking.confirmed.subtitle')}</ThemedText>
      <Entering index={2}>
        <BookingCard booking={booking} />
      </Entering>
      {booking.discount ? (
        // The discounted price is the server's (informational: paid at the provider, no payment here).
        <ThemedText type="label">
          {t('booking.discounted', { price: formatPrice(booking.discount.discountedPriceCents), percent: booking.discount.discountPercent })}
        </ThemedText>
      ) : null}
      <ThemedText type="caption" themeColor="muted">
        {t('booking.confirmed.info')}
      </ThemedText>
      <Button
        label={t('booking.confirmed.viewBookings')}
        onPress={() => {
          router.dismissAll();
          router.push('/bookings');
        }}
      />
      <Button
        label={t('booking.confirmed.home')}
        variant="secondary"
        onPress={() => {
          router.dismissAll();
          router.navigate('/');
        }}
      />
    </Screen>
  );
}

/**
 * Figma 06 / Booking / Select Time — a modal (a focused task with one explicit action, HIG):
 * date and free time, which dogs, a note, the informational price, "Kinnita broneering".
 * Payment is out of scope: the price is "alates" and agreed with the provider.
 */
export default function BookScreen() {
  const { t } = useTranslation();
  // `startsAt` preselects a time chosen in the map's provider sheet (M9b).
  const { providerId, serviceId, startsAt: preset } = useLocalSearchParams<{ providerId: string; serviceId: string; startsAt?: string }>();
  const provider = useProvider(providerId);
  const slots = useServiceSlots(serviceId);
  const { data: dogs } = useMyDogs();
  const create = useCreateBooking();
  // M9b "Kasuta käppi": partners take a paw discount; an unused booking code for this provider is
  // reused (e.g. after a slot was taken), otherwise a new one is redeemed right before booking.
  const partner = useShop(null).data?.partners.find((p) => p.id === providerId);
  const openCode = useRedemptions().data?.find(
    (r) => r.offerType === 'booking' && r.status === 'active' && r.provider.id === providerId && r.bookingId === null,
  );
  const balance = usePointsBalance();
  const redeem = useRedeemOnce();
  const [usePaws, setUsePaws] = useState(false);
  const canUsePaws = Boolean(partner && (openCode || (balance !== null && balance >= partner.pointsCost)));
  const service = provider.data?.services.find((s) => s.id === serviceId);

  const [date, setDate] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(preset ?? null);
  const [chosenDogs, setChosenDogs] = useState<string[] | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<BookingWithDiscount | null>(null);

  if (booked) return <Confirmed booking={booked} />;

  const days = slots.data?.days ?? [];
  // Until the user picks, open the first day that has a free time.
  const presetDay = preset ? days.find((d) => d.slots.some((sl) => sl.startsAt === preset))?.date : undefined;
  const shownDate = date ?? presetDay ?? days.find((d) => d.slots.length > 0)?.date ?? days[0]?.date ?? null;
  // A time that vanished after a refetch (someone booked it) is no longer selected.
  const selectedStart = days.some((d) => d.slots.some((s) => s.startsAt === startsAt)) ? startsAt : null;
  const selectedDogs = chosenDogs ?? (dogs?.length === 1 ? [dogs[0]!.id] : []);
  const timeZone = slots.data?.timeZone ?? provider.data?.timeZone ?? DEVICE_TIME_ZONE;

  const toggleDog = (id: string) =>
    setChosenDogs(selectedDogs.includes(id) ? selectedDogs.filter((x) => x !== id) : [...selectedDogs, id].slice(-MAX_BOOKING_DOGS));

  async function submit() {
    if (!selectedStart) return setError(t('booking.chooseTime'));
    const { data, errors } = validateForm(bookingWithRedemptionInputSchema, { serviceId, startsAt: selectedStart, dogIds: selectedDogs, note });
    if (!data) return setError(Object.values(errors)[0] ?? t('errors.checkChoices'));
    setError(null);
    try {
      const redemptionId = usePaws && canUsePaws ? (openCode ?? (await redeem.run({ offerType: 'booking', offerId: providerId }))).id : null;
      setBooked(await create.mutateAsync({ ...data, redemptionId }));
      haptic('success');
    } catch (e) {
      // 409 (taken meanwhile): the hook refetches the free times, the stale one disappears.
      haptic('error');
      setError(errorMessage(e));
    }
  }

  const category = provider.data?.category ?? 'other';
  return (
    <Screen underHeader title={t(`booking.title.${category}`)} subtitle={provider.data?.name}>
      <FormError message={error ?? (provider.error ? errorMessage(provider.error) : slots.error ? errorMessage(slots.error) : null)} />
      {service ? (
        <ThemedText type="label">{t('booking.serviceLine', { service: service.name, duration: formatDuration(service.durationMinutes) })}</ThemedText>
      ) : null}

      {slots.isPending ? <SkeletonList rows={2} rowHeight={44} /> : null}
      {slots.data && days.every((d) => d.slots.length === 0) ? <ThemedText themeColor="muted">{t('booking.noSlots')}</ThemedText> : null}
      {days.length > 0 ? (
        <SlotPicker
          days={days}
          timeZone={timeZone}
          date={shownDate}
          onDateChange={(d) => {
            setDate(d);
            setStartsAt(null);
          }}
          startsAt={selectedStart}
          onStartChange={setStartsAt}
        />
      ) : null}
      {timeZone !== DEVICE_TIME_ZONE ? (
        <ThemedText type="caption" themeColor="muted">
          {t('booking.timeZoneNote', { zone: timeZone })}
        </ThemedText>
      ) : null}

      <ThemedText type="heading">{t('booking.who')}</ThemedText>
      {dogs?.length === 0 ? (
        <>
          <ThemedText themeColor="muted">{t('booking.noDogs')}</ThemedText>
          <Button label={t('booking.addDog')} variant="secondary" onPress={() => router.push('/dogs/edit')} />
        </>
      ) : null}
      <ChipRow>
        {dogs?.map((dog) => (
          <IconChip key={dog.id} icon="paw-print" label={dog.name} selected={selectedDogs.includes(dog.id)} onPress={() => toggleDog(dog.id)} />
        ))}
      </ChipRow>

      <TextField
        label={t('booking.note')}
        placeholder={t('booking.notePlaceholder')}
        value={note}
        onChangeText={setNote}
        maxLength={BOOKING_NOTE_MAX}
        multiline
      />

      {service ? (
        <View style={styles.price}>
          <ThemedText type="heading">{t('booking.price', { price: priceLabel(service.priceCents, service.priceIsFrom) })}</ThemedText>
          <ThemedText type="caption" themeColor="muted">
            {t('booking.priceNote')} {t('booking.cancelRule', { count: BOOKING_CUTOFF_MINUTES / 60 })}
          </ThemedText>
        </View>
      ) : null}

      {partner ? (
        <>
          <SwitchRow
            label={t('booking.usePaws', { percent: partner.pawDiscountPercent })}
            hint={
              openCode
                ? t('booking.usePawsCode', { code: openCode.code })
                : balance !== null && balance < partner.pointsCost
                  ? t('booking.usePawsShort', { cost: pawsLabel(partner.pointsCost), balance: pawsLabel(balance) })
                  : t('booking.usePawsCost', { cost: pawsLabel(partner.pointsCost) })
            }
            value={usePaws && canUsePaws}
            disabled={!canUsePaws}
            onValueChange={setUsePaws}
          />
          {usePaws && canUsePaws && service ? (
            <ThemedText type="caption" themeColor="muted">
              {t('booking.usePawsNote', { percent: partner.pawDiscountPercent })}
            </ThemedText>
          ) : null}
        </>
      ) : null}

      <Button label={t('booking.submit')} loading={create.isPending || redeem.isPending} disabled={!service || dogs?.length === 0} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  price: { gap: Spacing.one },
});
