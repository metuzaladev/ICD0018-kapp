import { PASSWORD_MIN, requestPasswordResetInputSchema } from '@kapp/shared';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authClient, authErrorMessage } from '@/lib/auth-client';
import { validateForm } from '@/lib/form';

const STEPS = [1, 2, 3] as const;

/** Figma reset steps card: what happens after "Saada taastamislink"; step 1 (this screen) is highlighted. */
function Steps() {
  const c = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.steps, { backgroundColor: c.surface }]}>
      {STEPS.map((step) => {
        const title = t(`auth.resetPassword.step${step}Title`);
        const body = t(`auth.resetPassword.step${step}Body`, { min: PASSWORD_MIN });
        const current = step === 1;
        return (
          <View key={step} style={styles.step} accessible accessibilityLabel={t('auth.resetPassword.stepA11y', { step, title, body })}>
            <View style={[styles.stepNumber, { backgroundColor: current ? c.brand : c.background }]}>
              <ThemedText type="caption" style={{ color: current ? c.onBrand : c.muted }}>
                {step}
              </ThemedText>
            </View>
            <View style={styles.stepText}>
              <ThemedText type="label">{title}</ThemedText>
              <ThemedText type="caption" themeColor="muted">
                {body}
              </ThemedText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Figma 01 / Account / Reset Password (6:220, M9): lock tile, e-mail, submit, 3-step card. */
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

  const c = useTheme();
  return (
    <Screen underHeader title={t('auth.resetPassword.title')} subtitle={t('auth.resetPassword.subtitle')}>
      <View style={[styles.lock, { backgroundColor: c.soft }]} accessibilityElementsHidden importantForAccessibility="no">
        <Icon name="lock" size={32} color={c.brand} />
      </View>
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
      <Button label={t('auth.resetPassword.submit')} trailingIcon="arrow-right" loading={loading} onPress={submit} />
      <Steps />
      <Button label={t('auth.backToSignIn')} variant="tertiary" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lock: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  steps: { padding: Spacing.three, borderRadius: Radius[16], gap: Spacing.three },
  step: { flexDirection: 'row', gap: 12 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, gap: 2 },
});
