import { LANGUAGES } from '@kapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { appearance, useAppearancePreference } from '@/hooks/use-appearance';
import { useTheme } from '@/hooks/use-theme';
import { currentLanguage } from '@/i18n';
import { setLanguagePreference, useLanguagePreference, type LanguagePreference } from '@/i18n/language-preference';
import { APPEARANCE_PREFERENCES } from '@/lib/appearance';
import { authClient } from '@/lib/auth-client';
import { haptic } from '@/lib/haptics';
import { unregisterPushToken } from '@/lib/push';

const OPTIONS: LanguagePreference[] = ['auto', ...LANGUAGES];

/** One radio group card (language, appearance): one VoiceOver radio per row, a check on the chosen one. */
function OptionGroup<T extends string>({
  options,
  selected,
  label,
  onSelect,
}: {
  options: readonly T[];
  selected: T;
  label: (option: T) => string;
  onSelect: (option: T) => void;
}) {
  const c = useTheme();
  return (
    <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="radiogroup">
      {options.map((option, index) => {
        const checked = selected === option;
        return (
          <PressableScale
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={label(option)}
            accessibilityState={{ checked }}
            onPress={() => {
              haptic('selection');
              onSelect(option);
            }}
            style={[styles.row, index > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <ThemedText type="label" style={styles.label}>
              {label(option)}
            </ThemedText>
            {checked ? <Icon name="check" size={20} color={c.brand} /> : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

/**
 * Figma 07 / Settings / Overview: edit profile, notifications, privacy, language, appearance, and
 * (M10) the "Konto" section: privacy & terms, sign out, delete account.
 * Location, help and "add a park" from Figma arrive with the features they control.
 */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const preference = useLanguagePreference();
  const appearancePreference = useAppearancePreference();
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
      <ListRow icon="user" title={t('settings.editProfile')} subtitle={t('settings.editProfileSub')} onPress={() => router.push('/profile-edit')} />
      <ListRow icon="bell" title={t('settings.notifications')} subtitle={t('settings.notificationsSub')} onPress={() => router.push('/settings-notifications')} />
      <ListRow icon="lock" title={t('settings.privacy')} subtitle={t('settings.privacySub')} onPress={() => router.push('/settings-privacy')} />

      <ThemedText type="heading" accessibilityRole="header">
        {t('settings.language')}
      </ThemedText>
      <OptionGroup options={OPTIONS} selected={preference} label={optionLabel} onSelect={(o) => void setLanguagePreference(o)} />

      {/* Default light: the redesign is drawn in light mode; dark and "follow the system" are opt-in (docs/05). */}
      <ThemedText type="heading" accessibilityRole="header">
        {t('settings.appearance')}
      </ThemedText>
      <OptionGroup
        options={APPEARANCE_PREFERENCES}
        selected={appearancePreference}
        label={(o) => t(`settings.appearanceOptions.${o}`)}
        onSelect={(o) => void appearance.set(o)}
      />

      {/* M10 (docs/17): legal texts, data export and account deletion; deletion is the last, red row. */}
      <ThemedText type="heading" accessibilityRole="header">
        {t('settings.account')}
      </ThemedText>
      <ListRow icon="shield" title={t('settings.legal')} subtitle={t('settings.legalSub')} onPress={() => router.push('/privacy-terms')} />
      <Button label={t('settings.signOut')} variant="tertiary" loading={signingOut} onPress={signOut} />
      <ListRow icon="trash-2" danger title={t('settings.deleteAccount')} subtitle={t('settings.deleteAccountSub')} onPress={() => router.push('/delete-account')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, gap: Spacing.three },
  label: { flex: 1 },
});
