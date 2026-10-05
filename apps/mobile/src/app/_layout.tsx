import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors, FontAssets } from '@/constants/theme';
import { authClient } from '@/lib/auth-client';
import { queryClient } from '@/lib/query-client';

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
  const signedIn = Boolean(session);

  // Keep the splash until fonts and the stored session are known, to avoid a flash of the
  // welcome screen for users who are already signed in. A font error must not block the app.
  const ready = (fontsLoaded || fontError !== null) && !isPending;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Cached server data belongs to one user: never show the previous user's favourites.
  useEffect(() => {
    if (!signedIn) queryClient.clear();
  }, [signedIn]);

  if (!ready) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: { ...base.colors, primary: c.brand, background: c.background, card: c.background, text: c.text, border: c.border },
  };
  const pushed = { headerShown: true, headerTransparent: true, headerBackButtonDisplayMode: 'minimal' as const };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={navigationTheme}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="parks/[parkId]" options={pushed} />
            <Stack.Screen name="favorites" options={{ ...pushed, headerTitle: '' }} />
            <Stack.Screen name="visits" options={{ ...pushed, headerTitle: '' }} />
            <Stack.Screen name="dogs/index" options={{ ...pushed, headerTitle: '' }} />
            <Stack.Screen name="dogs/[dogId]/index" options={pushed} />
            <Stack.Screen name="dogs/[dogId]/photos" options={pushed} />
            <Stack.Screen name="dogs/[dogId]/health" options={pushed} />
            {/* Modals: focused edit tasks with an explicit "done" action (HIG). */}
            <Stack.Screen name="profile-edit" options={{ presentation: 'modal', headerShown: true, title: 'Muuda profiili' }} />
            <Stack.Screen name="park-filters" options={{ presentation: 'modal', headerShown: true, title: 'Filtrid' }} />
            <Stack.Screen name="dogs/edit" options={{ presentation: 'modal', headerShown: true }} />
            <Stack.Screen name="dogs/[dogId]/health-edit" options={{ presentation: 'modal', headerShown: true }} />
            <Stack.Screen name="check-in" options={{ presentation: 'modal', headerShown: true, title: 'Märgi kohalolek' }} />
            <Stack.Screen name="plan-visit" options={{ presentation: 'modal', headerShown: true, title: 'Planeeri külastus' }} />
            <Stack.Screen name="review" options={{ presentation: 'modal', headerShown: true, title: 'Hinnang' }} />
            <Stack.Screen name="report" options={{ presentation: 'modal', headerShown: true, title: 'Teavita' }} />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
