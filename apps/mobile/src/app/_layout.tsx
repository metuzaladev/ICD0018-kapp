import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors, FontAssets } from '@/constants/theme';
import { authClient } from '@/lib/auth-client';

SplashScreen.preventAutoHideAsync();

/**
 * Root navigator. Signed-out users can only reach the (auth) group, signed-in users only the
 * app. Stack.Protected redirects automatically when the session appears or disappears, so
 * screens never navigate after sign-in/sign-out themselves.
 */
export default function RootLayout() {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const c = Colors[scheme];
  const [fontsLoaded, fontError] = useFonts(FontAssets);
  const { data: session, isPending } = authClient.useSession();

  // Keep the splash until fonts and the stored session are known, to avoid a flash of the
  // welcome screen for users who are already signed in. A font error must not block the app.
  const ready = (fontsLoaded || fontError !== null) && !isPending;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: { ...base.colors, primary: c.brand, background: c.background, card: c.background, text: c.text, border: c.border },
  };
  const signedIn = Boolean(session);

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="profile-edit"
            options={{ presentation: 'modal', headerShown: true, title: 'Muuda profiili' }}
          />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
