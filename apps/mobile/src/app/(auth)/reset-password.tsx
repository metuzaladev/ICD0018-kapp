import { requestPasswordResetInputSchema } from '@kapp/shared';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { authClient, authErrorMessage } from '@/lib/auth-client';
import { validateForm } from '@/lib/form';

/** Figma 01 / Account / Reset Password. */
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const { data, errors: invalid } = validateForm(requestPasswordResetInputSchema, { email });
    setErrors(invalid ?? {});
    setFormError(null);
    if (!data) return;

    setLoading(true);
    const { error } = await authClient.requestPasswordReset({
      email: data.email,
      // The emailed link opens the API, which redirects here with ?token=… (kapp:// or exp:// in Expo Go).
      redirectTo: Linking.createURL('/new-password'),
    });
    setLoading(false);
    if (error) return setFormError(authErrorMessage(error));
    // Same screen whether or not the address has an account — no account enumeration.
    router.replace('/reset-sent');
  }

  return (
    <Screen underHeader title={t('auth.resetPassword.title')} subtitle={t('auth.resetPassword.subtitle')}>
      <FormError message={formError} />
      <TextField
        label={t('auth.email')}
        placeholder={t('auth.emailPlaceholder')}
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="send"
        onSubmitEditing={submit}
      />
      <ThemedView type="soft" style={styles.hint}>
        <ThemedText type="label">{t('auth.resetPassword.hintTitle')}</ThemedText>
        <ThemedText type="caption" themeColor="muted">
          {t('auth.resetPassword.hintBody')}
        </ThemedText>
      </ThemedView>
      <Button label={t('auth.resetPassword.submit')} loading={loading} onPress={submit} />
      <Button label={t('auth.backToSignIn')} variant="tertiary" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { padding: Spacing.three, borderRadius: Radius[16], gap: 2 },
});
