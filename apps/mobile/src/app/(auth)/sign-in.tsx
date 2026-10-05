import { signInInputSchema } from '@kapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { SocialSignIn } from '@/components/social-sign-in';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { authClient, authErrorMessage } from '@/lib/auth-client';
import { validateForm } from '@/lib/form';

/** Figma 01 / Account / Log In. */
export default function SignInScreen() {
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
    <Screen underHeader title="Tore sind jälle näha." subtitle="Mängusõbrad juba ootavad.">
      {notice === 'password-reset' ? (
        <ThemedText type="label" themeColor="link">
          Parool on muudetud. Logi uue parooliga sisse.
        </ThemedText>
      ) : null}
      <FormError message={formError} />
      <TextField
        label="E-post"
        placeholder="Sinu e-posti aadress"
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
        label="Parool"
        value={values.password}
        onChangeText={set('password')}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label="Logi sisse" loading={loading} onPress={submit} />
      <Button label="Unustasid parooli?" variant="tertiary" onPress={() => router.push('/reset-password')} />
      <SocialSignIn onError={setFormError} />
      <Button label="Loo uus konto" variant="secondary" onPress={() => router.replace('/sign-up')} />
    </Screen>
  );
}
