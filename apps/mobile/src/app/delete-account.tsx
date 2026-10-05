import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ErrorState } from '@/components/error-state';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { SocialSignIn } from '@/components/social-sign-in';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useDeleteAccount, useMe } from '@/hooks/use-account';
import { useTheme } from '@/hooks/use-theme';
import { canRequestDeletion, deleteAccountBody, deletionMeansGone, reauthMode } from '@/lib/account';
import { ApiRequestError, errorMessage } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { AUTH_APPLE_ENABLED, AUTH_GOOGLE_ENABLED } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { unregisterPushToken } from '@/lib/push';
import { sessionNotice } from '@/lib/session-notice';

const ITEMS = ['profile', 'dogs', 'visits', 'community', 'explore', 'services', 'reports'] as const;

/**
 * Settings → Konto → "Kustuta konto" (M10, docs/17; App Store 5.1.1(v), Google Play, GDPR art. 17).
 *
 * Says exactly what is deleted and that it is permanent, then asks for the password (email accounts)
 * or a fresh Apple/Google sign-in (the server allows 10 minutes). The final step is the system's
 * destructive confirmation alert with "Loobu" as the cancel button — HIG, no typed word and no dark
 * patterns: cancelling is always one tap and nothing is pre-selected for the user.
 */
export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const me = useMe();
  const remove = useDeleteAccount();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reauthenticated, setReauthenticated] = useState(false);

  if (me.isPending) {
    return (
      <Screen underHeader title={t('account.deleteTitle')}>
        <SkeletonList />
      </Screen>
    );
  }
  if (!me.data) {
    return (
      <Screen underHeader title={t('account.deleteTitle')}>
        <ErrorState message={errorMessage(me.error)} onRetry={() => void me.refetch()} retrying={me.isFetching} />
      </Screen>
    );
  }
  const mode = reauthMode(me.data);
  const socialAvailable = AUTH_APPLE_ENABLED || AUTH_GOOGLE_ENABLED;

  /** The account is gone: leave a notice for Welcome and drop the local session (root swaps screens). */
  async function finish() {
    haptic('success');
    sessionNotice.set('account-deleted');
    // Both only clear local state now; their server calls fail quietly (the session no longer exists).
    await unregisterPushToken();
    await authClient.signOut().catch(() => undefined);
  }

  async function run() {
    setError(null);
    try {
      await remove.mutateAsync(deleteAccountBody(mode, password));
      await finish();
    } catch (e) {
      if (e instanceof ApiRequestError && deletionMeansGone(e.status)) return finish();
      haptic('error');
      setError(errorMessage(e));
    }
  }

  function confirm() {
    haptic('warning');
    Alert.alert(t('account.confirmTitle'), t('account.confirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('account.confirmAction'), style: 'destructive', onPress: () => void run() },
    ]);
  }

  return (
    <Screen underHeader title={t('account.deleteTitle')} subtitle={t('account.deleteSubtitle')}>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <ThemedText type="heading" accessibilityRole="header">
          {t('account.whatGoes')}
        </ThemedText>
        {ITEMS.map((item) => (
          <View key={item} style={styles.item} accessible accessibilityLabel={t(`account.items.${item}`)}>
            <Icon name="trash-2" size={18} color={c.danger} />
            <ThemedText style={styles.itemText}>{t(`account.items.${item}`)}</ThemedText>
          </View>
        ))}
      </View>
      <ThemedText themeColor="muted">{t('account.messagesNote')}</ThemedText>
      <ThemedText themeColor="muted">{t('account.afterNote')}</ThemedText>

      <View style={styles.export}>
        <ThemedText type="label">{t('account.exportFirst')}</ThemedText>
        <Button label={t('legal.export')} variant="secondary" onPress={() => router.push('/privacy-terms')} />
      </View>

      {mode === 'password' ? (
        <TextField
          label={t('account.passwordLabel')}
          placeholder={t('account.passwordPlaceholder')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="done"
        />
      ) : (
        <View style={styles.reauth}>
          <ThemedText type="heading" accessibilityRole="header">
            {t('account.reauthTitle')}
          </ThemedText>
          <ThemedText themeColor="muted">{socialAvailable ? t('account.reauthBody') : t('account.reauthUnavailable')}</ThemedText>
          <SocialSignIn
            mode="signIn"
            onError={setError}
            onSuccess={() => {
              setReauthenticated(true);
              haptic('success');
            }}
          />
          {reauthenticated ? (
            <ThemedText type="label" themeColor="link" accessibilityLiveRegion="polite">
              {t('account.reauthDone')}
            </ThemedText>
          ) : null}
        </View>
      )}

      <FormError message={error} />
      <Button label={t('account.submit')} variant="danger" loading={remove.isPending} disabled={!canRequestDeletion(mode, password)} onPress={confirm} />
      <Button label={t('common.cancel')} variant="tertiary" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, gap: Spacing.two },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  itemText: { flex: 1 },
  export: { gap: Spacing.two },
  reauth: { gap: Spacing.two },
});
