import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
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
 */
export function SocialSignIn({ onError }: { onError: (message: string | null) => void }) {
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
  }

  if (!appleAvailable && !AUTH_GOOGLE_ENABLED) return null;

  return (
    <View style={styles.stack}>
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
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
      {AUTH_GOOGLE_ENABLED ? <Button variant="secondary" label={t('auth.social.google')} onPress={signInWithGoogle} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.two },
  apple: { height: 52, width: '100%' },
});
