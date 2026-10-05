import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { PawBackground } from '@/components/paw-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';

/** Figma 01 / Welcome. */
export default function WelcomeScreen() {
  const { t } = useTranslation();
  return (
    <ThemedView style={styles.root}>
      <PawBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}>
          <ThemedText type="label" themeColor="muted">
            {t('auth.welcome.region')}
          </ThemedText>
          <ThemedText type="display" accessibilityRole="header">
            käpp
          </ThemedText>
          <ThemedText type="hero">{t('auth.welcome.tagline')}</ThemedText>
        </View>

        <Image
          source={require('@/assets/images/welcome-dog.jpg')}
          style={styles.photo}
          contentFit="cover"
          accessibilityLabel={t('auth.welcome.photoLabel')}
        />

        <View style={styles.bottom}>
          <ThemedText themeColor="muted">{t('auth.welcome.intro')}</ThemedText>
          <Button label={t('auth.welcome.start')} onPress={() => router.push('/sign-up')} />
          <Button label={t('auth.welcome.haveAccount')} variant="secondary" onPress={() => router.push('/sign-in')} />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, padding: Spacing.screen, gap: Spacing.four },
  top: { gap: Spacing.two },
  photo: { flex: 1, minHeight: 160, borderRadius: Radius[16] },
  bottom: { gap: Spacing.three },
});
