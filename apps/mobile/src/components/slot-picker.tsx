import type { SlotDay } from '@kapp/shared';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatDayChip, formatTimeIn } from '@/lib/format';

type SlotPickerProps = {
  days: SlotDay[];
  timeZone: string;
  date: string | null;
  onDateChange: (date: string) => void;
  startsAt: string | null;
  onStartChange: (startsAt: string) => void;
};

/**
 * Figma "Booking / Select Time": date chips (a week, scrolls sideways) and the free times of the
 * chosen day as chips. Only times the server offered are shown, so an invalid time cannot be picked;
 * days without free times stay visible (dimmed text) so a closed Monday does not look like a bug.
 */
export function SlotPicker({ days, timeZone, date, onDateChange, startsAt, onStartChange }: SlotPickerProps) {
  const { t } = useTranslation();
  const selectedDay = days.find((d) => d.date === date);

  return (
    <>
      <ThemedText type="heading">{t('booking.date')}</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
        {days.map((d) => (
          <View key={d.date} style={[styles.dayChip, d.slots.length === 0 && styles.dim]}>
            <Chip label={formatDayChip(d.date)} selected={d.date === date} onPress={() => onDateChange(d.date)} />
          </View>
        ))}
      </ScrollView>

      <ThemedText type="heading">{t('booking.time')}</ThemedText>
      {selectedDay && selectedDay.slots.length === 0 ? <ThemedText themeColor="muted">{t('booking.dayFull')}</ThemedText> : null}
      <View style={styles.wrap}>
        {selectedDay?.slots.map((slot) => (
          <View key={slot.startsAt} style={styles.timeChip}>
            <Chip label={formatTimeIn(slot.startsAt, timeZone)} selected={slot.startsAt === startsAt} onPress={() => onStartChange(slot.startsAt)} />
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  scrollRow: { gap: Spacing.two },
  // minWidth, not width: Russian day names ("вт, 6 окт.") must not be cut off.
  dayChip: { minWidth: 96 },
  dim: { opacity: 0.5 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  // Four per row like the plan-visit hours; no flexGrow so a lone last chip does not stretch.
  timeChip: { width: '23%' },
});
