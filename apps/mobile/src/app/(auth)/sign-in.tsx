import { signInInputSchema } from '@kapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { OrDivider } from '@/components/feature-row';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { SocialSignIn } from '@/components/social-sign-in';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { authClient, authErrorMessage } from '@/lib/auth-client';
import { validateForm } from '@/lib/form';

/**
 * Figma 01 / Account / Log In (6:168, M9): Apple first (when available), "või e-postiga", the form.
 * The Figma "Freddy ootab juba" card needs a remembered dog from a previous session; the app does not
 * keep one on the device after sign-out (privacy), so the card is omitted.
 */
export default function SignInScreen() {
  const { t } = useTranslation();
  // Set after a successful password reset (new-password.tsx).
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof values) => (text: string) => setValues((v) => ({ ...v, [key]: text }));

  async function submit() {
    const { data, errors: invalid } = validateForm(signInInputSchema, values);
    setErrors(invalid ?? {});
    setFormError(null);
    if (!data) return;

    setLoading(true);
    const { error } = await authClient.signIn.email(data);
    setLoading(false);
    setFormError(authErrorMessage(error));
  }

  return (
    <Screen underHeader title={t('auth.signIn.title')} subtitle={t('auth.signIn.subtitle')}>
      {notice === 'password-reset' ? (
        <ThemedText type="label" themeColor="link">
          {t('auth.signIn.passwordChanged')}
        </ThemedText>
      ) : null}
      <SocialSignIn mode="signIn" onError={setFormError} footer={<OrDivider label={t('auth.orEmail')} />} />
      <FormError message={formError} />
      <TextField
        label={t('auth.email')}
        placeholder={t('auth.emailPlaceholder')}
        value={values.email}
        onChangeText={set('email')}
        error={errors.email}
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
      />
      <TextField
        label={t('auth.password')}
        placeholder={t('auth.signIn.passwordPlaceholder')}
        value={values.password}
        onChangeText={set('password')}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label={t('auth.signIn.submit')} trailingIcon="arrow-right" loading={loading} onPress={submit} />
      <Button label={t('auth.signIn.forgot')} variant="tertiary" onPress={() => router.push('/reset-password')} />
      <Button label={t('auth.signIn.createAccount')} variant="secondary" onPress={() => router.replace('/sign-up')} />
    </Screen>
  );
}
