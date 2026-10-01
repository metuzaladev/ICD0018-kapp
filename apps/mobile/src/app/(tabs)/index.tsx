import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { OfflineBanner } from '@/components/offline-banner';
import { ParkRow } from '@/components/park-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { useMyDogs } from '@/hooks/use-dogs';
import { useHealthReminders } from '@/hooks/use-health';
import { useNearbyParks } from '@/hooks/use-parks';
import { useActiveCheckIn, usePlannedVisits } from '@/hooks/use-visits';
import { authClient } from '@/lib/auth-client';
import { dueLabel, formatDate, formatDay, formatTime, formatToday } from '@/lib/format';
import { useParkFilters } from '@/state/park-filters';

/**
 * Figma 02 / Home / Today: current visit, own plans, health reminders (due within 30 days or
 * overdue), nearby parks. Friends' plans arrive in M5.
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const location = useDeviceLocation();
  // Same query key as the map tab, so both screens share one cached request.
  const { data: parks = [] } = useNearbyParks(location.origin, useParkFilters());
  const { data: active } = useActiveCheckIn();
  const { data: plans = [] } = usePlannedVisits();
  const { data: reminders = [] } = useHealthReminders();
  const { data: dogs } = useMyDogs();
  // Figma asks the dog ("Õue, Freddy?"); with several dogs (or none) the owner is greeted instead.
  const greetName = dogs?.length === 1 ? dogs[0]!.name : session?.user.name.split(' ')[0];
  const openPark = (parkId: string) => router.push({ pathname: '/parks/[parkId]', params: { parkId } });

  return (
    <Screen
      title={greetName ? t('home.greeting', { name: greetName }) : t('home.greetingNoName')}
      subtitle={t('home.subtitle', { date: formatToday() })}>
      <OfflineBanner />

      {active ? (
        <ThemedView type="tint" style={styles.card}>
          {/* Park names are never declined ("Kadrioru koerapargis"), so the name stands on its own line. */}
          <ThemedText type="heading">{t('home.activeTitle')}</ThemedText>
          <ThemedText type="label">{active.park.name}</ThemedText>
          <ThemedText>
            {t('home.activeDogs', { dogs: active.dogs.map((d) => d.name).join(', '), time: formatTime(active.expiresAt) })}
          </ThemedText>
          <Button label={t('home.openPark')} variant="secondary" onPress={() => openPark(active.park.id)} />
        </ThemedView>
      ) : (
        <ThemedView type="soft" style={styles.card}>
          <ThemedText type="heading">{t('home.idleTitle')}</ThemedText>
          <ThemedText themeColor="muted">{t('home.idleBody')}</ThemedText>
        </ThemedView>
      )}

      {plans.slice(0, 2).map((p) => (
        <ThemedView key={p.id} type="surface" style={styles.card}>
          <ThemedText type="label">{p.park.name}</ThemedText>
          <ThemedText type="caption" themeColor="muted">
            {t('home.planned', { day: formatDay(p.startsAt), from: formatTime(p.startsAt), to: formatTime(p.endsAt) })}
          </ThemedText>
        </ThemedView>
      ))}

      {reminders.length > 0 ? (
        <>
          <ThemedText type="heading">{t('home.remindersTitle')}</ThemedText>
          {reminders.slice(0, 3).map((r) => (
            <ListRow
              key={r.recordId}
              title={`${r.dog.name} · ${r.title}`}
              subtitle={t('home.reminderDue', { date: formatDate(r.nextDue), due: dueLabel(r.nextDue) })}
              alert={r.overdue}
              onPress={() => router.push({ pathname: '/dogs/[dogId]/health', params: { dogId: r.dog.id } })}
            />
          ))}
        </>
      ) : null}

      <Button label={t('home.findPark')} onPress={() => router.navigate('/map')} />

      {parks.length > 0 ? (
        <>
          <ThemedText type="heading">{t('home.nearby')}</ThemedText>
          {parks.slice(0, 3).map((park) => (
            <ParkRow key={park.id} park={park} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.four, borderRadius: Radius[16], gap: Spacing.two },
});
