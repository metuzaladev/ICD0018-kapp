import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useMe, useResendVerification } from '@/hooks/use-account';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';

/**
 * "Kinnita e-post" (M10, docs/17): shown on Home until the address is confirmed. Sign-in is never
 * blocked by it; the banner only nudges. The profile query refetches on focus, so the banner goes
 * away when the user comes back from the confirmation link in the browser.
 */
export function VerifyEmailBanner() {
  const { t } = useTranslation();
  const c = useTheme();
  const { data: me } = useMe();
  const resend = useResendVerification();
  if (!me || me.emailVerified) return null;

  return (
    <View style={[styles.card, { backgroundColor: c.soft }]}>
      <View style={styles.row} accessible accessibilityLabel={`${t('verifyEmail.title')}. ${t('verifyEmail.body', { email: me.email })}`}>
        <Icon name="mail" size={22} color={c.accent} />
        <View style={styles.text}>
          <ThemedText type="label">{t('verifyEmail.title')}</ThemedText>
          <ThemedText type="caption" themeColor="muted">
            {t('verifyEmail.body', { email: me.email })}
          </ThemedText>
        </View>
      </View>
      {resend.isSuccess ? (
        <ThemedText type="caption" themeColor="link" accessibilityLiveRegion="polite">
          {t('verifyEmail.sent')}
        </ThemedText>
      ) : (
        <Button label={t('verifyEmail.resend')} variant="tertiary" loading={resend.isPending} onPress={() => resend.mutate()} />
      )}
      <FormError message={resend.error ? errorMessage(resend.error) : null} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius[16], gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  text: { flex: 1, gap: 2 },
});
