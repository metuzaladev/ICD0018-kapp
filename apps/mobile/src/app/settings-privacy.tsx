import { presenceSharingSchema } from '@kapp/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { SwitchRow } from '@/components/switch-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useBlockedUsers, useOwnProfile, useUnblockUser, useUpdateOwnProfile } from '@/hooks/use-safety';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';

/** Figma 07 / Settings / Privacy: friend requests, presence sharing, blocked users. */
export default function PrivacySettingsScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const profile = useOwnProfile();
  const update = useUpdateOwnProfile();
  const blocked = useBlockedUsers();
  const unblock = useUnblockUser();
  const error = profile.error ?? update.error ?? blocked.error ?? unblock.error;

  return (
    <Screen underHeader title={t('privacy.title')} subtitle={t('privacy.subtitle')}>
      {error ? <FormError message={errorMessage(error)} /> : null}

      <ThemedView type="soft" style={styles.card}>
        <ThemedText type="label">{t('privacy.healthTitle')}</ThemedText>
        <ThemedText themeColor="muted">{t('privacy.healthBody')}</ThemedText>
      </ThemedView>

      <SwitchRow
        label={t('privacy.allowRequests')}
        hint={t('privacy.allowRequestsHint')}
        value={profile.data?.allowFriendRequests ?? true}
        disabled={!profile.data || update.isPending}
        onValueChange={(allowFriendRequests) => update.mutate({ allowFriendRequests })}
      />

      <ThemedText type="heading">{t('privacy.presence')}</ThemedText>
      <ThemedText type="caption" themeColor="muted">
        {t('privacy.presenceHint')}
      </ThemedText>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {presenceSharingSchema.options.map((option) => (
          <Chip
            key={option}
            label={t(`profileEdit.presence.${option}`)}
            selected={profile.data?.presenceSharing === option}
            onPress={() => update.mutate({ presenceSharing: option })}
          />
        ))}
      </View>

      <ThemedText type="heading">{t('privacy.blocked')}</ThemedText>
      <ThemedText type="caption" themeColor="muted">
        {t('privacy.blockedHint')}
      </ThemedText>
      {blocked.data?.length === 0 ? <ThemedText themeColor="muted">{t('privacy.blockedEmpty')}</ThemedText> : null}
      {blocked.data?.map((b) => (
        <View key={b.id} style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
          <ThemedText type="label" style={styles.flex}>
            {b.firstName}
          </ThemedText>
          <View style={styles.unblock}>
            <Button label={t('privacy.unblock')} variant="secondary" disabled={unblock.isPending} onPress={() => unblock.mutate(b.id)} />
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius[16], gap: Spacing.one },
  chips: { flexDirection: 'row', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two, paddingLeft: Spacing.three, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  unblock: { minWidth: 140 },
});
