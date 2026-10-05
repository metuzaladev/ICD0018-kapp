import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from 'react-native';

import { Colors, FontAssets } from '@/constants/theme';
import { useCommunityRuntime } from '@/hooks/use-community-runtime';
// Initialises i18next before any screen renders.
import '@/i18n';
import { loadLanguagePreference } from '@/i18n/language-preference';
import { authClient } from '@/lib/auth-client';
import { queryClient } from '@/lib/query-client';

SplashScreen.preventAutoHideAsync();

/** Realtime socket, push registration and push taps while signed in (needs the query client). */
function CommunityRuntime({ signedIn }: { signedIn: boolean }) {
  useCommunityRuntime(signedIn);
  return null;
}

/**
 * Root navigator. Signed-out users can only reach the (auth) group, signed-in users only the
 * app. Stack.Protected redirects automatically when the session appears or disappears, so
 * screens never navigate after sign-in/sign-out themselves.
 */
export default function RootLayout() {
  const { t } = useTranslation();
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const c = Colors[scheme];
  const [fontsLoaded, fontError] = useFonts(FontAssets);
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session);
  const [languageLoaded, setLanguageLoaded] = useState(false);

  useEffect(() => {
    loadLanguagePreference().finally(() => setLanguageLoaded(true));
  }, []);

  // Keep the splash until fonts, the stored session and the chosen language are known, to avoid a
  // flash of the welcome screen (or of the wrong language). A font error must not block the app.
  const ready = (fontsLoaded || fontError !== null) && !isPending && languageLoaded;
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
      <CommunityRuntime signedIn={signedIn} />
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
            <Stack.Screen name="settings" options={{ ...pushed, headerTitle: '' }} />
            <Stack.Screen name="dogs/[dogId]/index" options={pushed} />
            <Stack.Screen name="dogs/[dogId]/photos" options={{ ...pushed, headerTitle: '' }} />
            <Stack.Screen name="dogs/[dogId]/health" options={{ ...pushed, headerTitle: '' }} />
            <Stack.Screen name="friends/index" options={{ ...pushed, headerTitle: '' }} />
            <Stack.Screen name="users/[userId]" options={pushed} />
            <Stack.Screen name="messages/index" options={{ ...pushed, headerTitle: '' }} />
            {/* The conversation has its own composer layout, so it gets an opaque header. */}
            <Stack.Screen name="messages/[conversationId]" options={{ headerShown: true, headerBackButtonDisplayMode: 'minimal' }} />
            <Stack.Screen name="settings-privacy" options={{ ...pushed, headerTitle: '' }} />
            <Stack.Screen name="settings-notifications" options={{ ...pushed, headerTitle: '' }} />
            <Stack.Screen name="invite-park" options={{ ...pushed, headerTitle: '' }} />
            {/* Modals: focused edit tasks with an explicit "done" action (HIG). */}
            <Stack.Screen name="profile-edit" options={{ presentation: 'modal', headerShown: true, title: t('nav.profileEdit') }} />
            <Stack.Screen name="park-filters" options={{ presentation: 'modal', headerShown: true, title: t('nav.filters') }} />
            <Stack.Screen name="dogs/edit" options={{ presentation: 'modal', headerShown: true }} />
            <Stack.Screen name="dogs/[dogId]/health-edit" options={{ presentation: 'modal', headerShown: true }} />
            <Stack.Screen name="check-in" options={{ presentation: 'modal', headerShown: true, title: t('nav.checkIn') }} />
            <Stack.Screen name="plan-visit" options={{ presentation: 'modal', headerShown: true, title: t('nav.planVisit') }} />
            <Stack.Screen name="review" options={{ presentation: 'modal', headerShown: true, title: t('nav.review') }} />
            <Stack.Screen name="report" options={{ presentation: 'modal', headerShown: true, title: t('nav.report') }} />
            <Stack.Screen name="report-user" options={{ presentation: 'modal', headerShown: true, title: t('nav.reportUser') }} />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
