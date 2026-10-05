import { resetPasswordInputSchema } from '@kapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { authClient, authErrorMessage } from '@/lib/auth-client';
import { validateForm } from '@/lib/form';

/** Opened from the reset email (deep link with ?token=…). Not in Figma yet — follows Reset Password. */
export default function NewPasswordScreen() {
  const { token, error: linkError } = useLocalSearchParams<{ token?: string; error?: string }>();
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(
    !token || linkError ? 'Link on aegunud või vigane, küsi uus' : null,
  );
  const [loading, setLoading] = useState(false);

  async function submit() {
    const { data, errors: invalid } = validateForm(resetPasswordInputSchema, { token: token ?? '', newPassword });
    setErrors(invalid ?? {});
    if (!data) return;

    setLoading(true);
    const { error } = await authClient.resetPassword(data);
    setLoading(false);
    if (error) return setFormError(authErrorMessage(error));
    // All other sessions were revoked server-side (revokeSessionsOnPasswordReset).
    router.replace({ pathname: '/sign-in', params: { notice: 'password-reset' } });
  }

  return (
    <Screen underHeader title="Uus parool" subtitle="Vali parool, mida sa mujal ei kasuta.">
      <FormError message={formError} />
      <TextField
        label="Uus parool"
        placeholder="Vähemalt 8 tähemärki"
        value={newPassword}
        onChangeText={setNewPassword}
        error={errors.newPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label="Salvesta parool" loading={loading} disabled={!token} onPress={submit} />
      {!token ? <Button label="Küsi uus link" variant="tertiary" onPress={() => router.replace('/reset-password')} /> : null}
    </Screen>
  );
}
