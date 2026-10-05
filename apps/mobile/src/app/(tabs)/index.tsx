import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Entering } from '@/components/entering';
import { ListRow } from '@/components/list-row';
import { OfflineBanner } from '@/components/offline-banner';
import { CommunityPicks } from '@/components/community-picks';
import { NearestParkCard } from '@/components/nearest-park-card';
import { ParkActivitySection } from '@/components/park-activity-section';
import { ParkCard } from '@/components/park-card';
import { PointsBadge } from '@/components/points-badge';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VerifyEmailBanner } from '@/components/verify-email-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { photoSource } from '@/hooks/use-photos';
import { useMyDogs } from '@/hooks/use-dogs';
import { useFriendPlans } from '@/hooks/use-friends';
import { useHealthReminders } from '@/hooks/use-health';
import { usePlacePostFeed } from '@/hooks/use-explore';
import { useFavoriteParks, useNearbyParks, useParkActivity } from '@/hooks/use-parks';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useActiveCheckIn, usePlannedVisits } from '@/hooks/use-visits';
import { errorMessage } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { DEFAULT_FEED_FILTERS, feedQueryParams } from '@/lib/explore';
import { dueLabel, formatDate, formatDay, formatTime, formatToday } from '@/lib/format';
import { activityParkIds, COMMUNITY_PICKS, communityPicks } from '@/lib/home-activity';
import { parkKindOf } from '@/lib/map-categories';
import { useParkFilters } from '@/state/park-filters';

/**
 * Figma 02 / Home / Today (10:69, M9 light redesign): "käpp" + Käpad badge, greeting, a dog photo,
 * current visit, the "Lähim park" card (main action by distance), M11 "Lemmikparkides täna", own
 * plans, friends' plans (M5), M11 "Kogukonna soovitused", health reminders and nearby parks.
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
  const favoritesQuery = useFavoriteParks();
  const { data: parks = [] } = nearby;
  const { data: active } = activeQuery;
  const { data: plans = [] } = plansQuery;
  const { data: reminders = [] } = remindersQuery;
  const { data: friendPlans = [] } = friendPlansQuery;
  // M11: favourites decide the activity parks; until they are known nothing is asked (no flash of
  // the nearest-park fallback for a user who has favourites).
  const activityTarget = activityParkIds(favoritesQuery.data, parks);
  const activityEnabled = favoritesQuery.isSuccess && activityTarget.ids.length > 0;
  const activityQuery = useParkActivity(activityEnabled ? activityTarget.ids : []);
  // Same feed as Avasta "Lähedal", a few rows only (own pending posts are filtered out below).
  const feedQuery = usePlacePostFeed({ ...feedQueryParams(DEFAULT_FEED_FILTERS, location.origin), limit: COMMUNITY_PICKS + 2 });
  const picks = communityPicks(feedQuery.data?.pages[0]?.items ?? []);
  const refresh = usePullToRefresh(
    nearby.refetch,
    activeQuery.refetch,
    plansQuery.refetch,
    remindersQuery.refetch,
    friendPlansQuery.refetch,
    favoritesQuery.refetch,
    activityQuery.refetch,
    feedQuery.refetch,
  );
  // Figma asks the dog ("Õue, Freddy?"); with several dogs (or none) the owner is greeted instead.
  const greetName = dogs?.length === 1 ? dogs[0]!.name : session?.user.name.split(' ')[0];
  const heroPhoto = dogs?.find((d) => d.profilePhoto)?.profilePhoto?.url ?? null;
  const nearestPark = parks.find((p) => parkKindOf(p) === 'park') ?? parks[0];
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
        <PointsBadge onPress={() => router.push('/rewards')} />
      </View>
      <ThemedText themeColor="muted">{t('home.subtitle', { date: formatToday() })}</ThemedText>
      <OfflineBanner />
      <VerifyEmailBanner />

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
      ) : null}
      {/* No idle "how to use" card: when not in a park, the nearest park and the activity in the
          user's parks below answer "what now?" with real data, and they move up the screen (M11). */}

      {/* Figma Home: the nearest dog park right under today's card — the main action of the app
          ("Oleme siin" nearby, directions from further away; same choice as on the map). */}
      {nearestPark ? (
        <NearestParkCard park={nearestPark} usingFallback={location.usingFallback} />
      ) : (
        <Button label={t('home.findPark')} onPress={() => router.navigate('/map')} />
      )}

      {/* Hidden when favourites cannot be loaded: "no favourites yet" would be wrong then. */}
      {favoritesQuery.isError && !favoritesQuery.data ? null : (
        <ParkActivitySection
          query={activityQuery}
          source={activityTarget.source}
          loading={favoritesQuery.isPending || (activityEnabled && activityQuery.isPending)}
        />
      )}

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

      <CommunityPicks
        posts={picks}
        loading={feedQuery.isPending}
        error={feedQuery.error && !feedQuery.data ? { message: errorMessage(feedQuery.error), retry: () => void feedQuery.refetch(), retrying: feedQuery.isFetching } : null}
        onSuggest={() => router.push('/suggest-place')}
      />

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
  // Lower than the Figma 342×184: Home now carries park activity and community picks, which should
  // start above the fold on a 6.1" phone.
  hero: { width: '100%', aspectRatio: 342 / 120, borderRadius: Radius[24] },
  card: { padding: Spacing.four, borderRadius: Radius[16], gap: Spacing.two },
});
