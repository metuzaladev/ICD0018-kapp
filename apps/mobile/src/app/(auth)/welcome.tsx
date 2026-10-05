import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Fade } from '@/components/fade';
import { FormError } from '@/components/form-error';
import { LegalLinks } from '@/components/legal-links';
import { SessionNoticeBanner } from '@/components/session-notice-banner';
import { Icon } from '@/components/icon';
import { PawBackground } from '@/components/paw-background';
import { PhotoTile } from '@/components/photo-tile';
import { SocialSignIn } from '@/components/social-sign-in';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { TALLINN_CENTER } from '@/hooks/use-device-location';
import { useNearbyParks } from '@/hooks/use-parks';
import { useTheme } from '@/hooks/use-theme';
import { dogsLabel } from '@/lib/format';
import { useOnboardingSeen } from '@/lib/onboarding';
import { DEFAULT_FILTERS } from '@/state/park-filters';

/** Figma: the hero photo covers ~60 % of the 844 pt frame and fades into the background. */
const HERO_SHARE = 0.62;

/**
 * Figma "Live" card: the busiest park around Tallinn's centre right now, from the public
 * /parks/nearby endpoint (no account needed). Hidden while loading, on error or when no dogs are out
 * — never a made-up number. Dog names are not public before sign-in, so the faces are paws.
 */
function LiveCard() {
  const c = useTheme();
  const { t } = useTranslation();
  const { data } = useNearbyParks(TALLINN_CENTER, DEFAULT_FILTERS);
  const busiest = data?.reduce<(typeof data)[number] | null>((best, p) => ((p.activeDogs ?? 0) > (best?.activeDogs ?? 0) ? p : best), null);
  const dogs = busiest?.activeDogs ?? 0;
  if (!busiest || dogs === 0) return null;
  return (
    <View
      accessible
      accessibilityLabel={t('auth.welcome.liveA11y', { park: busiest.name, dogs: dogsLabel(dogs) })}
      style={[styles.live, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.faces}>
        {[0, 1, 2].slice(0, Math.min(dogs, 3)).map((i) => (
          <PhotoTile key={i} size={28} radius={8} border={{ width: 2, color: c.surface }} style={i > 0 && styles.faceOverlap} />
        ))}
      </View>
      <View style={styles.liveText}>
        <ThemedText type="label">{t('auth.welcome.liveTitle', { dogs: dogsLabel(dogs) })}</ThemedText>
        <ThemedText type="caption" themeColor="muted" numberOfLines={1}>
          {busiest.name}
        </ThemedText>
      </View>
      <View style={[styles.dot, { backgroundColor: c.mapPark }]} />
    </View>
  );
}

/**
 * Figma 01 / Welcome (6:6, M9): full-bleed corgi photo fading into the background, "Tallinn · Eesti"
 * tag, a live card, the "käpp" wordmark, hero and body text, "Alustame", Apple and "Mul on juba konto".
 * On a device that has never seen the intro, Onboarding comes first.
 */
export default function WelcomeScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [error, setError] = useState<string | null>(null);
  // Loaded before the splash hides (root layout), so this never flashes Welcome first.
  if (useOnboardingSeen() === false) return <Redirect href="/onboarding" />;
  const heroHeight = Math.round(height * HERO_SHARE);

  return (
    <ThemedView style={styles.root}>
      <PawBackground />
      <View style={[styles.hero, { height: heroHeight }]}>
        <Image
          source={require('@/assets/images/welcome-dog.jpg')}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
          accessibilityLabel={t('auth.welcome.photoLabel')}
        />
        <Fade direction="down" style={{ bottom: 0, height: heroHeight * 0.45 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.three }]}>
        <SessionNoticeBanner />
        <View style={[styles.tag, { backgroundColor: c.surface }]}>
          <Icon name="map-pin" size={14} color={c.text} />
          <ThemedText type="caption">{t('auth.welcome.region')}</ThemedText>
        </View>
        {/* Pushes the copy down to where the photo fades out; content still scrolls at large text sizes. */}
        <View style={{ flexGrow: 1, minHeight: heroHeight * 0.38 }} />
        <LiveCard />
        <ThemedText type="display" accessibilityRole="header">
          käpp
        </ThemedText>
        <ThemedText type="hero">{t('auth.welcome.tagline')}</ThemedText>
        <ThemedText themeColor="muted">{t('auth.welcome.intro')}</ThemedText>
        <View style={styles.actions}>
          <FormError message={error} />
          <Button label={t('auth.welcome.start')} trailingIcon="arrow-right" onPress={() => router.push('/sign-up')} />
          <SocialSignIn onError={setError} showGoogle={false} />
          <Button label={t('auth.welcome.haveAccount')} variant="tertiary" onPress={() => router.push('/sign-in')} />
        </View>
        {/* M10: the store requires the privacy policy to be reachable before signing up. */}
        <LegalLinks />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { position: 'absolute', top: 0, left: 0, right: 0 },
  content: { flexGrow: 1, paddingHorizontal: Spacing.screen, gap: Spacing.three },
  tag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    opacity: 0.92,
  },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: Radius[16],
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  faces: { flexDirection: 'row' },
  faceOverlap: { marginLeft: -8 },
  liveText: { flex: 1, gap: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  actions: { gap: Spacing.two, marginTop: Spacing.two },
});
