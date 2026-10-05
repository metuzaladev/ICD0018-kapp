import { USER_SEARCH_MIN, type PersonSummary, type UserSearchResult } from '@kapp/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { FormError } from '@/components/form-error';
import { ListRow } from '@/components/list-row';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import {
  useAcceptFriendRequest,
  useDeleteFriendRequest,
  useFriendRequests,
  useFriends,
  useSendFriendRequest,
  useUserSearch,
} from '@/hooks/use-friends';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { personTitle } from '@/lib/format';

const openProfile = (userId: string) => router.push({ pathname: '/users/[userId]', params: { userId } });
const subtitleOf = (p: Pick<PersonSummary, 'area'>, extra?: string) => [p.area, extra].filter(Boolean).join(' · ') || null;

/** Figma 05 / Community / Friends: search, incoming and outgoing requests, friends. */
export default function FriendsScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const friends = useFriends();
  const requests = useFriendRequests();
  const search = useUserSearch(query);
  const send = useSendFriendRequest();
  const accept = useAcceptFriendRequest();
  const remove = useDeleteFriendRequest();
  const mutationError = send.error ?? accept.error ?? remove.error;
  const card = [styles.card, { backgroundColor: c.surface, borderColor: c.border }];
  const refresh = usePullToRefresh(friends.refetch, requests.refetch);

  // Debounce: one request when the user pauses typing, not one per letter.
  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), 350);
    return () => clearTimeout(id);
  }, [text]);

  const searchAction = (r: UserSearchResult) => {
    if (r.relation === 'friend') return null;
    if (r.relation === 'outgoing') return <ThemedText type="caption" themeColor="muted">{t('friends.requestSent')}</ThemedText>;
    if (r.relation === 'incoming')
      return <Button label={t('friends.accept')} variant="secondary" disabled={accept.isPending} onPress={() => accept.mutate(r.id)} />;
    if (!r.acceptsRequests) return <ThemedText type="caption" themeColor="muted">{t('friends.requestsOff')}</ThemedText>;
    return <Button label={t('friends.add')} variant="secondary" disabled={send.isPending} onPress={() => send.mutate(r.id)} />;
  };

  return (
    <Screen underHeader title={t('friends.title')} subtitle={t('friends.subtitle')} refresh={refresh}>
      <OfflineBanner />
      {mutationError ? <FormError message={errorMessage(mutationError)} /> : null}

      <TextField
        label={t('friends.search')}
        placeholder={t('friends.searchPlaceholder')}
        value={text}
        onChangeText={setText}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="search"
        maxLength={50}
      />
      {text.trim().length > 0 && text.trim().length < USER_SEARCH_MIN ? (
        <ThemedText type="caption" themeColor="muted">
          {t('friends.searchHint', { min: USER_SEARCH_MIN })}
        </ThemedText>
      ) : null}
      {search.error ? <FormError message={errorMessage(search.error)} /> : null}
      {search.data?.length === 0 ? (
        <ThemedText themeColor="muted" accessibilityLiveRegion="polite">
          {t('friends.noResults')}
        </ThemedText>
      ) : null}
      {search.data?.map((r) => (
        <View key={r.id} style={card}>
          <ListRow photo={{ name: r.dogNames[0] ?? r.firstName }} title={personTitle(r.firstName, r.dogNames)} subtitle={r.area} onPress={() => openProfile(r.id)} />
          {searchAction(r)}
        </View>
      ))}

      {requests.data && requests.data.incoming.length > 0 ? (
        <>
          <ThemedText type="heading" accessibilityRole="header">
            {t('friends.incoming')}
          </ThemedText>
          {requests.data.incoming.map(({ user }) => (
            <View key={user.id} style={card}>
              <ListRow photo={{ name: user.dogNames[0] ?? user.firstName }} title={personTitle(user.firstName, user.dogNames)} subtitle={subtitleOf(user)} onPress={() => openProfile(user.id)} />
              <View style={styles.actions}>
                <View style={styles.flex}>
                  <Button label={t('friends.accept')} disabled={accept.isPending} onPress={() => accept.mutate(user.id)} />
                </View>
                <View style={styles.flex}>
                  <Button label={t('friends.decline')} variant="secondary" disabled={remove.isPending} onPress={() => remove.mutate(user.id)} />
                </View>
              </View>
            </View>
          ))}
        </>
      ) : null}

      {requests.data && requests.data.outgoing.length > 0 ? (
        <>
          <ThemedText type="heading" accessibilityRole="header">
            {t('friends.outgoing')}
          </ThemedText>
          {requests.data.outgoing.map(({ user }) => (
            <View key={user.id} style={card}>
              <ListRow
                photo={{ name: user.dogNames[0] ?? user.firstName }}
                title={personTitle(user.firstName, user.dogNames)}
                subtitle={subtitleOf(user, t('friends.requestSent'))}
                onPress={() => openProfile(user.id)}
              />
              <Button label={t('friends.cancelRequest')} variant="tertiary" disabled={remove.isPending} onPress={() => remove.mutate(user.id)} />
            </View>
          ))}
        </>
      ) : null}

      <ThemedText type="heading" accessibilityRole="header">
        {t('friends.myFriends')}
      </ThemedText>
      {friends.error && !friends.data ? (
        <ErrorState message={errorMessage(friends.error)} onRetry={() => void friends.refetch()} retrying={friends.isFetching} />
      ) : null}
      {friends.isPending ? <SkeletonList /> : null}
      {friends.data?.length === 0 ? <EmptyState title={t('friends.emptyTitle')} body={t('friends.emptyBody')} /> : null}
      {friends.data?.map((f, i) => (
        <Entering key={f.id} index={i}>
          <ListRow photo={{ name: f.dogNames[0] ?? f.firstName }} title={personTitle(f.firstName, f.dogNames)} subtitle={f.area} onPress={() => openProfile(f.id)} />
        </Entering>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.two, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, gap: Spacing.two },
  // Wraps at large text sizes: "Принять" / "Отклонить" side by side need room.
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  flex: { flexGrow: 1, flexBasis: 140 },
});
