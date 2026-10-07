import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { authClient, authErrorMessage } from '@/lib/auth-client';
import { AUTH_APPLE_ENABLED, AUTH_GOOGLE_ENABLED } from '@/lib/config';

/**
 * Continue with Apple / Google. Apple's button draws its own text in the device language.
 *
 * Apple: native sheet (expo-apple-authentication) → identity token → Better Auth verifies it.
 * Uses Apple's own button component, as App Store guideline 4.8 and the HIG require.
 * Google: browser redirect flow (works in Expo Go); a native Google SDK needs a dev build (M8).
 * Both are hidden unless the API has credentials configured (EXPO_PUBLIC_AUTH_*).
 * M9: shown first on the account screens (Figma), with an "or with e-mail" divider as `footer`.
 */
type SocialSignInProps = {
  onError: (message: string | null) => void;
  /** Apple's button text: "Continue with Apple" (welcome, sign-up) or "Sign in with Apple" (log in). */
  mode?: 'continue' | 'signIn';
  /** Welcome shows only Apple (Figma); the account screens add Google. */
  showGoogle?: boolean;
  /** Drawn under the buttons when at least one is shown (Figma "või e-postiga" divider). */
  footer?: ReactNode;
  /** M10 re-authentication before deleting the account: called after a successful sign-in. */
  onSuccess?: () => void;
};

export function SocialSignIn({ onError, mode = 'continue', showGoogle = true, footer, onSuccess }: SocialSignInProps) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios' && AUTH_APPLE_ENABLED) {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
    }
  }, []);

  async function signInWithApple() {
    onError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('missing identity token');
      const { error } = await authClient.signIn.social({ provider: 'apple', idToken: { token: credential.identityToken } });
      onError(authErrorMessage(error));
      if (!error) onSuccess?.();
    } catch (e) {
      // The user closing the Apple sheet is not an error.
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      onError(t('auth.social.appleFailed'));
    }
  }

  async function signInWithGoogle() {
    onError(null);
    const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
    onError(authErrorMessage(error));
    if (!error) onSuccess?.();
  }

  const google = showGoogle && AUTH_GOOGLE_ENABLED;
  if (!appleAvailable && !google) return null;

  return (
    <View style={styles.stack}>
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            mode === 'signIn'
              ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
          }
          buttonStyle={
            scheme === 'dark'
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={Radius[16]}
          style={styles.apple}
          onPress={signInWithApple}
        />
      ) : null}
      {google ? <Button variant="secondary" label={t('auth.social.google')} onPress={signInWithGoogle} /> : null}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.two },
  apple: { height: 52, width: '100%' },
});
