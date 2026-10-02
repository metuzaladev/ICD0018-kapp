import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { ListRow } from '@/components/list-row';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAcceptFriendRequest, useDeleteFriendRequest, useRemoveFriend, useSendFriendRequest, useUserProfile } from '@/hooks/use-friends';
import { useStartConversation } from '@/hooks/use-messages';
import { errorMessage } from '@/lib/api';
import { ageLabel, formatFriendsSince, personTitle } from '@/lib/format';

/** Figma 05 / Community / Friend Profile — also the profile of anyone found in search or in a park. */
export default function UserProfileScreen() {
  const { t } = useTranslation();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { data: person, error, isPending } = useUserProfile(userId);
  const send = useSendFriendRequest();
  const accept = useAcceptFriendRequest();
  const cancel = useDeleteFriendRequest();
  const unfriend = useRemoveFriend();
  const start = useStartConversation();
  const actionError = send.error ?? accept.error ?? cancel.error ?? unfriend.error ?? start.error;
  const name = person ? personTitle(person.firstName, person.dogs.map((d) => d.name)) : '';

  async function openChat() {
    const conversation = await start.mutateAsync(userId);
    router.push({ pathname: '/messages/[conversationId]', params: { conversationId: conversation.id } });
  }

  function confirmUnfriend() {
    if (!person) return;
    Alert.alert(t('userProfile.unfriendTitle', { name: person.firstName }), t('userProfile.unfriendBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('userProfile.unfriend'), style: 'destructive', onPress: () => unfriend.mutate(userId) },
    ]);
  }

  const subtitle = person
    ? [person.area, person.friendsSince ? t('userProfile.friendsSince', { date: formatFriendsSince(person.friendsSince) }) : null]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <Screen underHeader title={name} subtitle={subtitle}>
        <OfflineBanner />
        {error && !person ? <FormError message={errorMessage(error)} /> : null}
        {actionError ? <FormError message={errorMessage(actionError)} /> : null}
        {isPending ? <ThemedText themeColor="muted">{t('common.loading')}</ThemedText> : null}

        {person ? (
          <>
            {person.bio ? <ThemedText>{person.bio}</ThemedText> : null}

            {person.relation === 'friend' ? (
              <>
                <Button label={t('userProfile.message')} loading={start.isPending} onPress={() => void openChat().catch(() => {})} />
                <Button
                  label={t('userProfile.invite')}
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/invite-park', params: { userId, name: person.firstName } })}
                />
              </>
            ) : null}
            {person.relation === 'none' && person.acceptsRequests ? (
              <Button label={t('userProfile.addFriend')} loading={send.isPending} onPress={() => send.mutate(userId)} />
            ) : null}
            {person.relation === 'none' && !person.acceptsRequests ? (
              <ThemedText themeColor="muted">{t('friends.requestsOff')}</ThemedText>
            ) : null}
            {person.relation === 'incoming' ? (
              <Button label={t('userProfile.acceptRequest')} loading={accept.isPending} onPress={() => accept.mutate(userId)} />
            ) : null}
            {person.relation === 'outgoing' ? (
              <Button label={t('friends.cancelRequest')} variant="secondary" loading={cancel.isPending} onPress={() => cancel.mutate(userId)} />
            ) : null}

            {person.dogs.map((dog) => (
              <ThemedView key={dog.id} type="surface" style={styles.card}>
                <ThemedText type="heading">{t('userProfile.dogProfile', { name: dog.name })}</ThemedText>
                <ThemedText themeColor="muted">
                  {[dog.breed, dog.birthDate ? ageLabel(dog.birthDate) : null].filter(Boolean).join(' · ') || t('common.dog')}
                </ThemedText>
                {dog.temperament ? <ThemedText>{dog.temperament}</ThemedText> : null}
              </ThemedView>
            ))}
            {person.relation !== 'friend' ? (
              <ThemedText type="caption" themeColor="muted">
                {t('userProfile.friendsOnlyDetails')}
              </ThemedText>
            ) : null}

            <ListRow
              title={t('userProfile.reportOrBlock')}
              subtitle={t('userProfile.reportOrBlockSub')}
              onPress={() => router.push({ pathname: '/report-user', params: { userId, name } })}
            />
            {person.relation === 'friend' ? <Button label={t('userProfile.unfriend')} variant="tertiary" onPress={confirmUnfriend} /> : null}
          </>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius[16], gap: Spacing.one },
});
