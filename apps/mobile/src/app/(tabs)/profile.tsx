import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { FormError } from '@/components/form-error';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useMyDogs } from '@/hooks/use-dogs';
import { useFriendRequests } from '@/hooks/use-friends';
import { useConversations } from '@/hooks/use-messages';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { useVisitHistory } from '@/hooks/use-visits';
import { dogsLabel, visitsLabel } from '@/lib/format';

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
  const unreadMessages = (useConversations().data ?? []).reduce((sum, conv) => sum + conv.unreadCount, 0);
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
      <ListRow title={t('profile.myDogs')} subtitle={dogs ? dogsLabel(dogs.length) : null} onPress={() => router.push('/dogs')} />
      <ListRow
        title={t('profile.friends')}
        subtitle={incoming > 0 ? t('profile.friendRequests', { count: incoming }) : t('profile.friendsSub')}
        onPress={() => router.push('/friends')}
      />
      <ListRow
        title={t('profile.messages')}
        subtitle={unreadMessages > 0 ? t('profile.unreadMessages', { count: unreadMessages }) : t('profile.messagesSub')}
        onPress={() => router.push('/messages')}
      />
      <ListRow title={t('profile.myVisits')} subtitle={t('profile.myVisitsSub')} onPress={() => router.push('/visits')} />
      <ListRow title={t('profile.favorites')} subtitle={t('profile.favoritesSub')} onPress={() => router.push('/favorites')} />
      <ListRow title={t('profile.settings')} subtitle={t('profile.settingsSub')} onPress={() => router.push('/settings')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, gap: Spacing.one },
});
