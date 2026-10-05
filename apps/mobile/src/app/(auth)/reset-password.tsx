import { requestPasswordResetInputSchema } from '@kapp/shared';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { authClient, authErrorMessage } from '@/lib/auth-client';
import { validateForm } from '@/lib/form';

/** Figma 01 / Account / Reset Password. */
export default function ResetPasswordScreen() {
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
    <Screen
      underHeader
      title="Unustasid parooli?"
      subtitle="Saadame sulle lingi, millega saad uue parooli määrata.">
      <FormError message={formError} />
      <TextField
        label="E-post"
        placeholder="Sinu e-posti aadress"
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
      <Button label="Saada taastamislink" loading={loading} onPress={submit} />
      <Button label="Tagasi sisselogimisse" variant="tertiary" onPress={() => router.back()} />
    </Screen>
  );
}
