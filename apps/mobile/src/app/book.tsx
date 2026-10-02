import { BOOKING_CUTOFF_MINUTES, BOOKING_NOTE_MAX, bookingInputSchema, MAX_BOOKING_DOGS, type Booking } from '@kapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { BookingCard } from '@/components/booking-card';
import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { SlotPicker } from '@/components/slot-picker';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useCreateBooking } from '@/hooks/use-bookings';
import { useMyDogs } from '@/hooks/use-dogs';
import { useProvider, useServiceSlots } from '@/hooks/use-services';
import { errorMessage } from '@/lib/api';
import { formatDuration, priceLabel } from '@/lib/format';
import { validateForm } from '@/lib/form';

/** The phone's zone; times are shown in the provider's, and we say so only when the two differ. */
const DEVICE_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** After booking: Figma 06 / Booking / Confirmed. */
function Confirmed({ booking }: { booking: Booking }) {
  const { t } = useTranslation();
  return (
    <Screen underHeader title={t('booking.confirmed.title')} subtitle={t('booking.confirmed.subtitle')}>
      <BookingCard booking={booking} />
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
  const { providerId, serviceId } = useLocalSearchParams<{ providerId: string; serviceId: string }>();
  const provider = useProvider(providerId);
  const slots = useServiceSlots(serviceId);
  const { data: dogs } = useMyDogs();
  const create = useCreateBooking();
  const service = provider.data?.services.find((s) => s.id === serviceId);

  const [date, setDate] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [chosenDogs, setChosenDogs] = useState<string[] | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Booking | null>(null);

  if (booked) return <Confirmed booking={booked} />;

  const days = slots.data?.days ?? [];
  // Until the user picks, open the first day that has a free time.
  const shownDate = date ?? days.find((d) => d.slots.length > 0)?.date ?? days[0]?.date ?? null;
  // A time that vanished after a refetch (someone booked it) is no longer selected.
  const selectedStart = days.some((d) => d.slots.some((s) => s.startsAt === startsAt)) ? startsAt : null;
  const selectedDogs = chosenDogs ?? (dogs?.length === 1 ? [dogs[0]!.id] : []);
  const timeZone = slots.data?.timeZone ?? provider.data?.timeZone ?? DEVICE_TIME_ZONE;

  const toggleDog = (id: string) =>
    setChosenDogs(selectedDogs.includes(id) ? selectedDogs.filter((x) => x !== id) : [...selectedDogs, id].slice(-MAX_BOOKING_DOGS));

  async function submit() {
    if (!selectedStart) return setError(t('booking.chooseTime'));
    const { data, errors } = validateForm(bookingInputSchema, { serviceId, startsAt: selectedStart, dogIds: selectedDogs, note });
    if (!data) return setError(Object.values(errors)[0] ?? t('errors.checkChoices'));
    setError(null);
    try {
      setBooked(await create.mutateAsync(data));
    } catch (e) {
      // 409 (taken meanwhile): the hook refetches the free times, the stale one disappears.
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

      {slots.isPending ? <ThemedText themeColor="muted">{t('common.loading')}</ThemedText> : null}
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
      <View style={styles.wrap}>
        {dogs?.map((dog) => (
          <View key={dog.id} style={styles.dogChip}>
            <Chip label={dog.name} selected={selectedDogs.includes(dog.id)} onPress={() => toggleDog(dog.id)} />
          </View>
        ))}
      </View>

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

      <Button label={t('booking.submit')} loading={create.isPending} disabled={!service || dogs?.length === 0} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  dogChip: { minWidth: '30%', flexGrow: 1 },
  price: { gap: Spacing.one },
});
