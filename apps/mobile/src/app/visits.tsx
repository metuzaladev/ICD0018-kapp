import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { FormError } from '@/components/form-error';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { useCancelPlan, usePlannedVisits, useVisitHistory } from '@/hooks/use-visits';
import { errorMessage } from '@/lib/api';
import { formatDay, formatDuration, formatTime } from '@/lib/format';

/** Figma 03 / Visits / History, plus the user's upcoming plans. */
export default function VisitsScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const history = useVisitHistory();
  const plans = usePlannedVisits();
  const cancel = useCancelPlan();
  const card = [styles.card, { backgroundColor: c.surface, borderColor: c.border }];
  const refresh = usePullToRefresh(history.refetch, plans.refetch);

  return (
    <Screen underHeader title={t('visits.title')} subtitle={t('visits.subtitle')} refresh={refresh}>
      <OfflineBanner />
      {cancel.error ? <FormError message={errorMessage(cancel.error)} /> : null}

      <ThemedText type="heading" accessibilityRole="header">
        {t('visits.planned')}
      </ThemedText>
      {plans.isPending ? <SkeletonList rows={1} /> : null}
      {/* Figma "Empty State / Meetups". A plan starts from a park, so the action opens the map. */}
      {plans.data?.length === 0 ? (
        <EmptyState
          title={t('visits.plannedEmptyTitle')}
          body={t('visits.plannedEmptyBody')}
          actionLabel={t('visits.plannedEmptyAction')}
          onAction={() => router.navigate('/map')}
        />
      ) : null}
      {plans.data?.map((p, i) => (
        <Entering key={p.id} index={i}>
          <ThemedView style={card}>
            {/* Park, time and note are read as one element; the cancel button stays separate. */}
            <View accessible style={styles.text}>
              <ThemedText type="label">{p.park.name}</ThemedText>
              <ThemedText type="caption" themeColor="muted">
                {formatDay(p.startsAt)} · {formatTime(p.startsAt)}–{formatTime(p.endsAt)}
              </ThemedText>
              {p.note ? <ThemedText type="caption">{p.note}</ThemedText> : null}
            </View>
            <Button label={t('visits.cancelPlan')} variant="tertiary" disabled={cancel.isPending} onPress={() => cancel.mutate(p.id)} />
          </ThemedView>
        </Entering>
      ))}

      <ThemedText type="heading" accessibilityRole="header">
        {t('visits.done')}
      </ThemedText>
      {history.error && !history.data ? (
        <ErrorState message={errorMessage(history.error)} onRetry={() => void history.refetch()} retrying={history.isFetching} />
      ) : null}
      {history.isPending ? <SkeletonList /> : null}
      {history.data?.length === 0 ? (
        <EmptyState title={t('visits.empty')} actionLabel={t('visits.emptyAction')} onAction={() => router.navigate('/map')} />
      ) : null}
      {history.data?.map((v, i) => (
        <Entering key={v.id} index={i}>
          <ThemedView style={card}>
            {/* One VoiceOver element per visit; the review button stays separate. */}
            <View accessible style={styles.text}>
              <View style={styles.headerRow}>
                <ThemedText type="label" style={styles.flex}>
                  {v.park.name}
                </ThemedText>
                <ThemedText type="caption" themeColor="muted">
                  {formatDuration(v.durationMinutes)}
                </ThemedText>
              </View>
              <ThemedText type="caption" themeColor="muted">
                {formatDay(v.startedAt)} · {formatTime(v.startedAt)} · {v.dogs.map((d) => d.name).join(', ') || '—'}
              </ThemedText>
            </View>
            {!v.hasReview ? (
              <Button
                label={t('visits.addReview')}
                variant="tertiary"
                onPress={() => router.push({ pathname: '/review', params: { parkId: v.park.id, parkName: v.park.name } })}
              />
            ) : null}
          </ThemedView>
        </Entering>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, gap: 2 },
  text: { gap: 2 },
  // Wraps at large text sizes so a long park name never pushes the duration off screen.
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
});
