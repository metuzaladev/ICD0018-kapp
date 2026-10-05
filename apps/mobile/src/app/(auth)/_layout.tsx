import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

// Signed-out users land on the welcome screen.
export const unstable_settings = { initialRouteName: 'welcome' };

/** Account screens: native stack with the system back button (HIG), transparent large header. */
export default function AuthLayout() {
  const c = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: '',
        headerTransparent: true,
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: c.text,
        contentStyle: { backgroundColor: c.background },
      }}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      {/* First launch only (Welcome redirects here); no back button, it is replaced when done. */}
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
    </Stack>
  );
}
