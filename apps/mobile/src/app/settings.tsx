import { LANGUAGES } from '@kapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { currentLanguage } from '@/i18n';
import { setLanguagePreference, useLanguagePreference, type LanguagePreference } from '@/i18n/language-preference';
import { authClient } from '@/lib/auth-client';
import { haptic } from '@/lib/haptics';
import { unregisterPushToken } from '@/lib/push';

const OPTIONS: LanguagePreference[] = ['auto', ...LANGUAGES];

/**
 * Figma 07 / Settings / Overview: edit profile, notifications, privacy, language, sign out.
 * Location, help and "add a park" from Figma arrive with the features they control.
 */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const preference = useLanguagePreference();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    // This phone must stop receiving this account's pushes (needs the session, so before sign-out).
    await unregisterPushToken();
    // Clears the session server-side and in SecureStore; the root layout then shows Welcome.
    await authClient.signOut();
  }

  // Language names are endonyms ("eesti", "English", "русский") so everyone finds their own.
  const optionLabel = (option: LanguagePreference) =>
    option === 'auto'
      ? t('settings.languageAutoCurrent', { language: t(`settings.languageNames.${currentLanguage()}`) })
      : t(`settings.languageNames.${option}`);

  return (
    <Screen underHeader title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <ListRow title={t('settings.editProfile')} subtitle={t('settings.editProfileSub')} onPress={() => router.push('/profile-edit')} />
      <ListRow title={t('settings.notifications')} subtitle={t('settings.notificationsSub')} onPress={() => router.push('/settings-notifications')} />
      <ListRow title={t('settings.privacy')} subtitle={t('settings.privacySub')} onPress={() => router.push('/settings-privacy')} />

      <ThemedText type="heading" accessibilityRole="header">
        {t('settings.language')}
      </ThemedText>
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="radiogroup">
        {OPTIONS.map((option, index) => {
          const selected = preference === option;
          return (
            <PressableScale
              key={option}
              accessibilityRole="radio"
              accessibilityLabel={optionLabel(option)}
              accessibilityState={{ checked: selected }}
              onPress={() => {
                haptic('selection');
                void setLanguagePreference(option);
              }}
              style={[styles.row, index > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <ThemedText type="label" style={styles.label}>
                {optionLabel(option)}
              </ThemedText>
              <ThemedText type="heading" style={{ color: c.brand }} accessibilityElementsHidden>
                {selected ? '✓' : ' '}
              </ThemedText>
            </PressableScale>
          );
        })}
      </View>

      <Button label={t('settings.signOut')} variant="tertiary" loading={signingOut} onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, gap: Spacing.three },
  label: { flex: 1 },
});
