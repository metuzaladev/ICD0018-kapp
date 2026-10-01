import { PermissionStatus } from 'expo-location';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';

type LocationPromptProps = {
  status: PermissionStatus;
  canAskAgain: boolean;
  onRequest: () => void;
};

/**
 * Figma "Permissions / Location" as an inline card. Explaining *before* the system dialog is an
 * HIG recommendation and raises acceptance; iOS only lets an app show that dialog once.
 */
export function LocationPrompt({ status, canAskAgain, onRequest }: LocationPromptProps) {
  const [dismissed, setDismissed] = useState(false);
  if (status === PermissionStatus.GRANTED || dismissed) return null;

  const denied = status === PermissionStatus.DENIED;
  return (
    <ThemedView type="soft" style={styles.card}>
      <ThemedText type="heading">{denied ? 'Asukoht on välja lülitatud' : 'Näita lähimaid parke'}</ThemedText>
      <ThemedText themeColor="muted">
        {denied
          ? 'Näitan parke Tallinna kesklinna järgi. Asukoha saad lubada seadetes.'
          : 'Asukoht aitab leida lähima pargi ja näidata kaugusi. Me ei jaga seda teistega ilma sinu loata.'}
      </ThemedText>
      <View style={styles.actions}>
        {denied && !canAskAgain ? (
          <Button label="Ava seaded" onPress={() => Linking.openSettings()} />
        ) : (
          <Button label="Luba asukoht" onPress={onRequest} />
        )}
        <Button label="Mitte praegu" variant="tertiary" onPress={() => setDismissed(true)} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.four, borderRadius: Radius[16], gap: Spacing.two },
  actions: { gap: Spacing.one, marginTop: Spacing.two },
});
