import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { authClient } from '@/lib/auth-client';

const PRESENCE_TEXT = { nobody: 'Mitte kellelegi', friends: 'Ainult sõpradele', everyone: 'Kõigile' } as const;

/** Figma 07 / Profile / Overview (account part; dogs and visits arrive in M3–M4). */
export default function ProfileScreen() {
  const c = useTheme();
  const { profile, error } = useProfile();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    // Clears the session server-side and in SecureStore; the root layout then shows Welcome.
    await authClient.signOut();
  }

  return (
    <Screen title="Sinu Käpp." subtitle="Kõik oluline, sinu kontrolli all.">
      <FormError message={error} />
      {profile ? (
        <ThemedView type="surface" style={[styles.card, { borderColor: c.border }]}>
          <ThemedText type="heading">{profile.name}</ThemedText>
          <ThemedText type="caption" themeColor="muted">
            {profile.email}
          </ThemedText>
          {profile.area ? <ThemedText type="caption">{profile.area}</ThemedText> : null}
          {profile.bio ? <ThemedText>{profile.bio}</ThemedText> : null}
          <ThemedText type="caption" themeColor="muted">
            Kohalolek nähtav: {PRESENCE_TEXT[profile.presenceSharing]}
          </ThemedText>
        </ThemedView>
      ) : null}
      <Button label="Muuda profiili" variant="secondary" onPress={() => router.push('/profile-edit')} />
      <Button label="Lemmikpargid" variant="secondary" onPress={() => router.push('/favorites')} />
      <Button label="Logi välja" variant="tertiary" loading={signingOut} onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, gap: Spacing.one },
});
