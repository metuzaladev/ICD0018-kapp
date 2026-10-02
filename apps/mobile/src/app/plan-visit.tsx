import { plannedVisitInputSchema } from '@kapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSendInvitation } from '@/hooks/use-messages';
import { usePlanVisit } from '@/hooks/use-visits';
import { errorMessage } from '@/lib/api';
import { formatDay, formatDurationShort, formatHour, formatTime } from '@/lib/format';
import { validateForm } from '@/lib/form';
import { haptic } from '@/lib/haptics';

const DAYS_SHOWN = 7;
const FIRST_HOUR = 6;
const LAST_HOUR = 22;
const DURATIONS = [30, 60, 90, 120] as const;

/** Next `DAYS_SHOWN` days at local midnight. */
function upcomingDays(now = new Date()) {
  return Array.from({ length: DAYS_SHOWN }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));
}

/** Figma 03 / Visit / Plan — modal. Chips instead of a date picker: plans are "today 17:00", not exact. */
export default function PlanVisitScreen() {
  const { t } = useTranslation();
  // inviteUserId: opened from "Kutsu parki" on a friend's profile (M5).
  const { parkId, parkName, inviteUserId } = useLocalSearchParams<{ parkId: string; parkName?: string; inviteUserId?: string }>();
  const plan = usePlanVisit();
  const invite = useSendInvitation();
  const days = useMemo(() => upcomingDays(), []);
  const [day, setDay] = useState(0);
  const [hour, setHour] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(60);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Today only offers hours that have not started yet.
  const nowHour = new Date().getHours();
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i).filter(
    (h) => day > 0 || h > nowHour,
  );

  async function submit() {
    if (hour === null) return setError(t('plan.chooseTime'));
    const start = new Date(days[day]!);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start.getTime() + duration * 60_000);
    const { data, errors } = validateForm(plannedVisitInputSchema, {
      parkId,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      note,
    });
    if (!data) return setError(Object.values(errors)[0] ?? t('errors.checkChoices'));
    setError(null);
    try {
      const saved = await plan.mutateAsync(data);
      haptic('success');
      if (inviteUserId) {
        // The invitation is an ordinary message in the sender's language, so the friend can reply.
        const { conversation } = await invite.mutateAsync({
          userId: inviteUserId,
          body: t('invite.message', { park: saved.park.name, day: formatDay(saved.startsAt), from: formatTime(saved.startsAt) }),
        });
        router.dismissAll();
        router.push({ pathname: '/messages/[conversationId]', params: { conversationId: conversation.id } });
        return;
      }
      router.back();
    } catch (e) {
      haptic('error');
      setError(errorMessage(e));
    }
  }

  return (
    <Screen underHeader title={t('plan.title')} subtitle={t('plan.subtitle')}>
      <FormError message={error} />
      {parkName ? <ThemedText type="label">{parkName}</ThemedText> : null}

      <ThemedText type="heading">{t('plan.date')}</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
        {days.map((d, i) => (
          <View key={d.toISOString()} style={styles.dayChip}>
            <Chip
              label={formatDay(d.toISOString())}
              selected={day === i}
              onPress={() => {
                setDay(i);
                setHour(null);
              }}
            />
          </View>
        ))}
      </ScrollView>

      <ThemedText type="heading">{t('plan.time')}</ThemedText>
      <View style={styles.wrap}>
        {hours.length === 0 ? <ThemedText themeColor="muted">{t('plan.tooLate')}</ThemedText> : null}
        {hours.map((h) => (
          <View key={h} style={styles.hourChip}>
            <Chip label={formatHour(h)} selected={hour === h} onPress={() => setHour(h)} />
          </View>
        ))}
      </View>

      <ThemedText type="heading">{t('plan.duration')}</ThemedText>
      <View style={styles.wrap} accessibilityRole="radiogroup">
        {DURATIONS.map((m) => (
          <Chip key={m} role="radio" label={formatDurationShort(m)} selected={duration === m} onPress={() => setDuration(m)} />
        ))}
      </View>

      <TextField label={t('plan.note')} placeholder={t('plan.notePlaceholder')} value={note} onChangeText={setNote} maxLength={200} />
      <Button label={t('plan.submit')} loading={plan.isPending} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollRow: { gap: Spacing.two },
  dayChip: { minWidth: 96 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  // Four per row without stretching a lone last chip; minWidth (not width) so "17:00" at 160 %
  // text size grows instead of being clipped.
  hourChip: { minWidth: '22%' },
});
