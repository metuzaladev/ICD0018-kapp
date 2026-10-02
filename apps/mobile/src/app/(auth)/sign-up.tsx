import { PASSWORD_MIN, signUpInputSchema } from '@kapp/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { OrDivider } from '@/components/feature-row';
import { FormError } from '@/components/form-error';
import { PhotoTile } from '@/components/photo-tile';
import { Screen } from '@/components/screen';
import { SocialSignIn } from '@/components/social-sign-in';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authClient, authErrorMessage } from '@/lib/auth-client';
import { validateForm } from '@/lib/form';
import { SAMPLE_DOGS } from '@/lib/sample-dogs';

/** Figma "Liitu 1 200 koeraomanikuga Tallinnas" strip, without the number: there is no member count API, and a made-up figure would mislead (docs/11). */
function SocialProof() {
  const c = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.proof, { backgroundColor: c.soft }]} accessible accessibilityLabel={t('auth.signUp.socialProof')}>
      <View style={styles.faces}>
        <Image source={require('@/assets/images/welcome-dog.jpg')} style={[styles.face, { borderColor: c.soft }]} contentFit="cover" accessible={false} />
        {[SAMPLE_DOGS.luna, SAMPLE_DOGS.rex, SAMPLE_DOGS.charlie].map((dog, i) => (
          <PhotoTile key={i} uri={dog} size={32} radius={9} border={{ width: 2, color: c.soft }} style={styles.faceOverlap} />
        ))}
      </View>
      <ThemedText type="label" style={styles.proofText}>
        {t('auth.signUp.socialProof')}
      </ThemedText>
    </View>
  );
}

/**
 * Figma 01 / Account / Sign Up (6:131, M9): social proof, Apple first (when available), "või
 * e-postiga", the form. On success the root layout switches to the app automatically.
 */
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
      <SocialProof />
      <SocialSignIn onError={setFormError} footer={<OrDivider label={t('auth.orEmail')} />} />
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
      <Button label={t('auth.signUp.submit')} trailingIcon="arrow-right" loading={loading} onPress={submit} />
      <Button label={t('auth.signUp.haveAccount')} variant="tertiary" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  proof: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius[16] },
  faces: { flexDirection: 'row' },
  face: { width: 32, height: 32, borderRadius: 9, borderWidth: 2 },
  faceOverlap: { marginLeft: -8 },
  proofText: { flex: 1 },
});
