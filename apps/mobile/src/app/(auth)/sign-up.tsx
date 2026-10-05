import { PASSWORD_MIN, signUpInputSchema } from '@kapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { SocialSignIn } from '@/components/social-sign-in';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { authClient, authErrorMessage } from '@/lib/auth-client';
import { validateForm } from '@/lib/form';

/** Figma 01 / Account / Sign Up. On success the root layout switches to the app automatically. */
export default function SignUpScreen() {
  const { t } = useTranslation();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof values) => (text: string) => setValues((v) => ({ ...v, [key]: text }));

  async function submit() {
    const { data, errors: invalid } = validateForm(signUpInputSchema, values);
    setErrors(invalid ?? {});
    setFormError(null);
    if (!data) return;

    setLoading(true);
    const { error } = await authClient.signUp.email(data);
    setLoading(false);
    setFormError(authErrorMessage(error));
  }

  return (
    <Screen underHeader title={t('auth.signUp.title')} subtitle={t('auth.signUp.subtitle')}>
      <FormError message={formError} />
      <TextField
        label={t('auth.signUp.name')}
        placeholder={t('auth.signUp.namePlaceholder')}
        value={values.name}
        onChangeText={set('name')}
        error={errors.name}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
      />
      <TextField
        label={t('auth.email')}
        placeholder={t('auth.signUp.emailPlaceholder')}
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
        placeholder={t('auth.passwordHint', { min: PASSWORD_MIN })}
        value={values.password}
        onChangeText={set('password')}
        error={errors.password}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <ThemedText type="caption" themeColor="muted">
        {t('auth.signUp.terms')}
      </ThemedText>
      <Button label={t('auth.signUp.submit')} loading={loading} onPress={submit} />
      <SocialSignIn onError={setFormError} />
      <Button label={t('auth.signUp.haveAccount')} variant="tertiary" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
