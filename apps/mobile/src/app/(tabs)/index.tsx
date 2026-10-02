import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Entering } from '@/components/entering';
import { ListRow } from '@/components/list-row';
import { OfflineBanner } from '@/components/offline-banner';
import { NearestParkCard } from '@/components/nearest-park-card';
import { ParkCard } from '@/components/park-card';
import { PointsBadge } from '@/components/points-badge';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { photoSource } from '@/hooks/use-photos';
import { useMyDogs } from '@/hooks/use-dogs';
import { useFriendPlans } from '@/hooks/use-friends';
import { useHealthReminders } from '@/hooks/use-health';
import { useNearbyParks } from '@/hooks/use-parks';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useActiveCheckIn, usePlannedVisits } from '@/hooks/use-visits';
import { authClient } from '@/lib/auth-client';
import { dueLabel, formatDate, formatDay, formatTime, formatToday } from '@/lib/format';
import { useParkFilters } from '@/state/park-filters';

/**
 * Figma 02 / Home / Today (10:69, M9 light redesign): "käpp" + Käpad badge, greeting, a dog photo,
 * current visit, own plans, friends' plans (M5), health reminders, the "Lähim park" card with
 * "Oleme siin" (replaces the old "Leia lähim park" button) and nearby parks as Park Cards.
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const location = useDeviceLocation();
  // Same query key as the map tab, so both screens share one cached request.
  const nearby = useNearbyParks(location.origin, useParkFilters());
  const activeQuery = useActiveCheckIn();
  const plansQuery = usePlannedVisits();
  const remindersQuery = useHealthReminders();
  const { data: dogs } = useMyDogs();
  const friendPlansQuery = useFriendPlans();
  const { data: parks = [] } = nearby;
  const { data: active } = activeQuery;
  const { data: plans = [] } = plansQuery;
  const { data: reminders = [] } = remindersQuery;
  const { data: friendPlans = [] } = friendPlansQuery;
  const refresh = usePullToRefresh(nearby.refetch, activeQuery.refetch, plansQuery.refetch, remindersQuery.refetch, friendPlansQuery.refetch);
  // Figma asks the dog ("Õue, Freddy?"); with several dogs (or none) the owner is greeted instead.
  const greetName = dogs?.length === 1 ? dogs[0]!.name : session?.user.name.split(' ')[0];
  const heroPhoto = dogs?.find((d) => d.profilePhoto)?.profilePhoto?.url ?? null;
  const openPark = (parkId: string) => router.push({ pathname: '/parks/[parkId]', params: { parkId } });

  return (
    <Screen refresh={refresh}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          {/* Brand wordmark, not translated (allowed in i18n:check). */}
          <ThemedText type="label" themeColor="muted" accessibilityElementsHidden importantForAccessibility="no">
            käpp
          </ThemedText>
          <ThemedText type="title" accessibilityRole="header">
            {greetName ? t('home.greeting', { name: greetName }) : t('home.greetingNoName')}
          </ThemedText>
        </View>
        <PointsBadge />
      </View>
      <ThemedText themeColor="muted">{t('home.subtitle', { date: formatToday() })}</ThemedText>
      <OfflineBanner />

      {/* Figma hero photo: the user's dog when it has a profile photo, otherwise the brand corgi (decorative). */}
      <Image
        source={heroPhoto ? photoSource(heroPhoto) : require('@/assets/images/welcome-dog.jpg')}
        style={styles.hero}
        contentFit="cover"
        transition={150}
        accessible={false}
      />

      {active ? (
        <ThemedView type="tint" style={styles.card} accessibilityLiveRegion="polite">
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

      {/* Figma Home: the nearest park with "Oleme siin" right under today's card — the main action of the app. */}
      {parks[0] ? <NearestParkCard park={parks[0]} /> : <Button label={t('home.findPark')} onPress={() => router.navigate('/map')} />}

      {plans.slice(0, 2).map((p, i) => (
        <Entering key={p.id} index={i}>
          {/* One VoiceOver element: park and time belong together. */}
          <ThemedView type="surface" style={styles.card} accessible>
            <ThemedText type="label">{p.park.name}</ThemedText>
            <ThemedText type="caption" themeColor="muted">
              {t('home.planned', { day: formatDay(p.startsAt), from: formatTime(p.startsAt), to: formatTime(p.endsAt) })}
            </ThemedText>
          </ThemedView>
        </Entering>
      ))}

      {/* Figma "Täna võiks koos mängida": friends' plans in the next 48 hours (M5). */}
      <ThemedView type="soft" style={styles.card}>
        <ThemedText type="heading">{t('home.friendsPlansTitle')}</ThemedText>
        {friendPlans.length === 0 ? <ThemedText themeColor="muted">{t('home.friendsPlansEmpty')}</ThemedText> : null}
        {friendPlans.slice(0, 3).map((p) => (
          <ListRow
            key={p.id}
            title={p.park.name}
            photo={{ name: p.friend.firstName }}
            subtitle={t('home.friendPlan', { name: p.friend.firstName, day: formatDay(p.startsAt), from: formatTime(p.startsAt), to: formatTime(p.endsAt) })}
            onPress={() => openPark(p.park.id)}
          />
        ))}
        <Button label={t('home.findFriends')} variant="secondary" onPress={() => router.push('/friends')} />
      </ThemedView>

      {reminders.length > 0 ? (
        <>
          <ThemedText type="heading" accessibilityRole="header">
            {t('home.remindersTitle')}
          </ThemedText>
          {reminders.slice(0, 3).map((r) => (
            <ListRow
              key={r.recordId}
              title={`${r.dog.name} · ${r.title}`}
              subtitle={t('home.reminderDue', { date: formatDate(r.nextDue), due: dueLabel(r.nextDue) })}
              photo={{ uri: dogs?.find((d) => d.id === r.dog.id)?.profilePhoto?.thumbnailUrl, name: r.dog.name }}
              alert={r.overdue}
              onPress={() => router.push({ pathname: '/dogs/[dogId]/health', params: { dogId: r.dog.id } })}
            />
          ))}
        </>
      ) : null}

      {/* Not on the Figma Home: without it the services were reachable only via Profile → bookings (docs/11). */}
      <ListRow icon="scissors" title={t('home.servicesTitle')} subtitle={t('home.servicesSub')} onPress={() => router.push('/services')} />

      {parks.length > 0 ? (
        <>
          <ThemedText type="heading" accessibilityRole="header">
            {t('home.nearby')}
          </ThemedText>
          {parks.slice(0, 3).map((park, i) => (
            <Entering key={park.id} index={i}>
              <ParkCard park={park} />
            </Entering>
          ))}
          {parks.length > 3 ? <Button label={t('home.allParks')} variant="tertiary" onPress={() => router.push('/parks')} /> : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  headerText: { flex: 1, gap: 2 },
  // Figma 342 × 184 at 390 pt; the ratio keeps it right on every width.
  hero: { width: '100%', aspectRatio: 342 / 184, borderRadius: Radius[24] },
  card: { padding: Spacing.four, borderRadius: Radius[16], gap: Spacing.two },
});
