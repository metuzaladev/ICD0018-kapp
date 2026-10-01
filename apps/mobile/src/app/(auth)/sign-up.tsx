import { signUpInputSchema } from '@kapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';

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
    <Screen underHeader title="Tere tulemast meie kampa." subtitle="Üks konto sulle ja sinu koertele.">
      <FormError message={formError} />
      <TextField
        label="Sinu nimi"
        placeholder="Ees- ja perekonnanimi"
        value={values.name}
        onChangeText={set('name')}
        error={errors.name}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
      />
      <TextField
        label="E-post"
        placeholder="nimi@näide.ee"
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
        placeholder="Vähemalt 8 tähemärki"
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
        Konto loomisel nõustud kasutustingimuste ja privaatsuspoliitikaga.
      </ThemedText>
      <Button label="Loo konto" loading={loading} onPress={submit} />
      <SocialSignIn onError={setFormError} />
      <Button label="Juba liige? Logi sisse" variant="tertiary" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
