import { LANGUAGES } from '@kapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { currentLanguage } from '@/i18n';
import { setLanguagePreference, useLanguagePreference, type LanguagePreference } from '@/i18n/language-preference';
import { authClient } from '@/lib/auth-client';

const OPTIONS: LanguagePreference[] = ['auto', ...LANGUAGES];

/**
 * Figma 07 / Settings / Overview: edit profile, language, sign out. Notifications, privacy and
 * location settings from Figma arrive with the features they control.
 */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const preference = useLanguagePreference();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
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

      <ThemedText type="heading" accessibilityRole="header">
        {t('settings.language')}
      </ThemedText>
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="radiogroup">
        {OPTIONS.map((option, index) => {
          const selected = preference === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setLanguagePreference(option)}
              style={({ pressed }) => [
                styles.row,
                index > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth },
                { opacity: pressed ? 0.8 : 1 },
              ]}>
              <ThemedText type="label" style={styles.label}>
                {optionLabel(option)}
              </ThemedText>
              <ThemedText type="heading" style={{ color: c.brand }} accessibilityElementsHidden>
                {selected ? '✓' : ' '}
              </ThemedText>
            </Pressable>
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
