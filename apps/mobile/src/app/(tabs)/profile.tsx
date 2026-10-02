import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { FormError } from '@/components/form-error';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useBookings } from '@/hooks/use-bookings';
import { useMyDogs } from '@/hooks/use-dogs';
import { useFriendRequests } from '@/hooks/use-friends';
import { useConversations } from '@/hooks/use-messages';
import { useProfile } from '@/hooks/use-profile';
import { useRewards } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
import { useVisitHistory } from '@/hooks/use-visits';
import { dogsLabel, pawsLabel, visitsLabel } from '@/lib/format';
import { levelNameKey } from '@/lib/rewards';

/**
 * Figma 07 / Profile / Overview: greeting, counts and the user's areas. Account settings
 * (edit profile, language, sign out) live on the Settings screen like in Figma.
 */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const { profile, error } = useProfile();
  const dogs = useMyDogs().data;
  const visits = useVisitHistory().data;
  const incoming = useFriendRequests().data?.incoming.length ?? 0;
  const upcomingBookings = useBookings('upcoming').data?.length ?? 0;
  const unreadMessages = (useConversations().data ?? []).reduce((sum, conv) => sum + conv.unreadCount, 0);
  const rewards = useRewards().data;
  const firstName = profile?.name.split(' ')[0];
  const stats =
    dogs && visits ? t('profile.stats', { dogs: dogsLabel(dogs.length), visits: visitsLabel(visits.length) }) : null;

  return (
    <Screen
      title={firstName ? t('profile.greeting', { name: firstName }) : t('profile.greetingNoName')}
      // Dog names are never declined ("Sinu ja Freddy …" would need the genitive), so the count decides.
      subtitle={t('profile.subtitle', { count: dogs?.length ?? 0 })}>
      <FormError message={error} />
      {profile ? (
        <ThemedView type="surface" style={[styles.card, { borderColor: c.border }]}>
          <ThemedText type="heading">{profile.name}</ThemedText>
          <ThemedText type="caption" themeColor="muted">
            {profile.email}
          </ThemedText>
          {profile.area ? <ThemedText type="caption">{profile.area}</ThemedText> : null}
          {profile.bio ? <ThemedText>{profile.bio}</ThemedText> : null}
          <ThemedText type="caption" themeColor="muted">
            {t('profile.presence', { who: t(`profile.presenceWho.${profile.presenceSharing}`) })}
          </ThemedText>
          {stats ? <ThemedText type="label">{stats}</ThemedText> : null}
        </ThemedView>
      ) : null}
      <ListRow
        title={t('profile.myDogs')}
        subtitle={dogs && dogs.length > 0 ? dogs.map((d) => d.name).join(', ') : dogs ? dogsLabel(0) : null}
        photo={dogs?.[0] ? { uri: dogs[0].profilePhoto?.thumbnailUrl, name: dogs[0].name } : undefined}
        icon={dogs?.[0] ? undefined : 'dog'}
        onPress={() => router.push('/dogs')}
      />
      <ListRow
        icon="users"
        title={t('profile.friends')}
        subtitle={incoming > 0 ? t('profile.friendRequests', { count: incoming }) : t('profile.friendsSub')}
        onPress={() => router.push('/friends')}
      />
      <ListRow
        icon="message-circle"
        title={t('profile.messages')}
        subtitle={unreadMessages > 0 ? t('profile.unreadMessages', { count: unreadMessages }) : t('profile.messagesSub')}
        onPress={() => router.push('/messages')}
      />
      <ListRow icon="calendar" title={t('profile.myVisits')} subtitle={t('profile.myVisitsSub')} onPress={() => router.push('/visits')} />
      {/* Figma "Minu broneeringud / Hooldus ja kohtumised" (M6). */}
      <ListRow
        icon="scissors"
        title={t('profile.bookings')}
        subtitle={upcomingBookings > 0 ? t('profile.upcomingBookings', { count: upcomingBookings }) : t('profile.bookingsSub')}
        onPress={() => router.push('/bookings')}
      />
      {/* M9b: Käpad (balance + level from the server), Pood and the user's recommendations. */}
      <ListRow
        icon="paw-print"
        title={t('profile.rewards')}
        subtitle={rewards ? t('profile.rewardsSub', { paws: pawsLabel(rewards.balance), level: t(levelNameKey(rewards.level.id)) }) : t('profile.rewardsSubEmpty')}
        onPress={() => router.push('/rewards')}
      />
      <ListRow icon="store" title={t('profile.shop')} subtitle={t('profile.shopSub')} onPress={() => router.push('/shop')} />
      <ListRow icon="sparkles" title={t('profile.myPosts')} subtitle={t('profile.myPostsSub')} onPress={() => router.push('/place-posts/mine')} />
      <ListRow icon="heart" title={t('profile.favorites')} subtitle={t('profile.favoritesSub')} onPress={() => router.push('/favorites')} />
      <ListRow icon="sliders-horizontal" title={t('profile.settings')} subtitle={t('profile.settingsSub')} onPress={() => router.push('/settings')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, gap: Spacing.one },
});
