import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';

export default function HomeScreen() {
  return (
    <Screen title="Õue, Freddy?" subtitle="Täna Tallinnas">
      <ThemedView type="soft" style={styles.card}>
        <ThemedText type="smallBold">Täna võiks koos mängida</ThemedText>
        <ThemedText themeColor="muted">
          Siia tulevad sõprade plaanid ja lähimad pargid, kui API ühendus on valmis.
        </ThemedText>
      </ThemedView>
      <Button label="Leia lähim park" onPress={() => router.navigate('/map')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.four, borderRadius: Radius[16], gap: Spacing.two },
});
