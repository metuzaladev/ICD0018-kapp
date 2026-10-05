import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Entering } from '@/components/entering';
import { FeatureRow } from '@/components/feature-row';
import { MapPreview } from '@/components/map-preview';
import { SAMPLE_DOGS } from '@/lib/sample-dogs';
import { PawBackground } from '@/components/paw-background';
import { PhotoTile } from '@/components/photo-tile';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { onboarding } from '@/lib/onboarding';

const PAGES = ['discover', 'connect'] as const;
type Page = (typeof PAGES)[number];

/** Figma page dots: the current page is a wide brand pill. VoiceOver hears "Samm 1, kokku 2" instead. */
function PageDots({ index }: { index: number }) {
  const c = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.dots} accessible accessibilityLabel={t('onboarding.step', { current: index + 1, total: PAGES.length })}>
      {PAGES.map((page, i) => (
        <View key={page} style={[styles.dot, i === index ? { width: 24, backgroundColor: c.brand } : { backgroundColor: c.border }]} />
      ))}
    </View>
  );
}

/**
 * Figma Onboarding / Connect collage: tilted rounded-square photos (the corgi and a bundled sample
 * dog, licences in docs/05) and a floating invite card. Marketing illustration with sample content, so
 * it is hidden from VoiceOver ("Mari ja Luna kutsuvad" would confuse a screen-reader user).
 */
function Collage() {
  const c = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.collage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={SAMPLE_DOGS.luna} style={[styles.tile, styles.tileBack]} contentFit="cover" accessible={false} />
      <Image source={require('@/assets/images/welcome-dog.jpg')} style={[styles.tile, styles.tileFront]} contentFit="cover" accessible={false} />
      <View style={[styles.invite, { backgroundColor: c.surface, borderColor: c.border }]}>
        <PhotoTile uri={SAMPLE_DOGS.luna} size={40} radius={12} />
        <View style={styles.inviteText}>
          <ThemedText type="label">{t('onboarding.connect.sampleTitle')}</ThemedText>
          <ThemedText type="caption" themeColor="muted">
            {t('onboarding.connect.sampleSubtitle')}
          </ThemedText>
        </View>
        <View style={[styles.inviteAction, { backgroundColor: c.brand }]}>
          <ThemedText type="caption" style={{ color: c.onBrand }}>
            {t('onboarding.connect.sampleAction')}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

function PageContent({ page, index, active }: { page: Page; index: number; active: boolean }) {
  const { t } = useTranslation();
  return (
    <View
      style={styles.page}
      // Only the visible page is reachable by VoiceOver; the other one is off screen.
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
      <Entering index={0}>
        <ThemedText type="title" accessibilityRole="header">
          {t(`onboarding.${page}.title`)}
        </ThemedText>
      </Entering>
      <Entering index={1}>
        <ThemedText themeColor="muted">{t(`onboarding.${page}.body`)}</ThemedText>
      </Entering>
      {page === 'discover' ? <MapPreview /> : <Collage />}
      <PageDots index={index} />
      {page === 'discover' ? (
        <>
          <FeatureRow icon="map-pin" title={t('onboarding.discover.seeTitle')} body={t('onboarding.discover.seeBody')} />
          <FeatureRow icon="users" title={t('onboarding.discover.crewTitle')} body={t('onboarding.discover.crewBody')} />
        </>
      ) : (
        <>
          <FeatureRow icon="calendar" title={t('onboarding.connect.planTitle')} body={t('onboarding.connect.planBody')} />
          <FeatureRow icon="paw-print" title={t('onboarding.connect.pawsTitle')} body={t('onboarding.connect.pawsBody')} />
        </>
      )}
    </View>
  );
}

/**
 * Figma Onboarding / Discover + Connect: shown once, on the first launch of a signed-out device,
 * before Welcome. Swipe or "Edasi" pages; "Jäta vahele" and the last page's actions mark it seen
 * (lib/onboarding.ts) and leave it for good — it is replaced, so "back" cannot return here.
 */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const last = index === PAGES.length - 1;

  const goTo = (next: number) => {
    scroller.current?.scrollTo({ x: next * width, animated: !reduceMotion });
    setIndex(next);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1)));

  async function finish(next: '/sign-up' | '/sign-in' | null) {
    await onboarding.markSeen();
    // Welcome becomes the root of the auth stack, so "back" from sign-up/sign-in lands there.
    router.replace('/welcome');
    if (next) router.push(next);
  }

  return (
    <ThemedView style={styles.root}>
      <PawBackground />
      <SafeAreaView style={styles.root}>
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          style={styles.root}>
          {PAGES.map((page, i) => (
            <ScrollView key={page} style={{ width }} contentContainerStyle={styles.pageScroll}>
              <PageContent page={page} index={i} active={i === index} />
            </ScrollView>
          ))}
        </ScrollView>

        <View style={styles.actions}>
          {last ? (
            <>
              <Button label={t('onboarding.createAccount')} trailingIcon="arrow-right" onPress={() => finish('/sign-up')} />
              <Button label={t('auth.welcome.haveAccount')} variant="tertiary" onPress={() => finish('/sign-in')} />
            </>
          ) : (
            <>
              <Button label={t('onboarding.next')} trailingIcon="arrow-right" onPress={() => goTo(index + 1)} />
              <Button label={t('onboarding.skip')} variant="tertiary" onPress={() => finish(null)} />
            </>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Each page scrolls vertically on its own, so very large text never clips the copy.
  pageScroll: { flexGrow: 1, padding: Spacing.screen },
  page: { flex: 1, gap: Spacing.three },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: Radius.full },
  collage: { height: 260, marginVertical: Spacing.two },
  tile: { position: 'absolute', borderRadius: 28 },
  tileBack: { left: 0, top: 10, width: '52%', height: 170, transform: [{ rotate: '-4deg' }] },
  tileFront: { right: 0, top: 0, width: '58%', height: 200, transform: [{ rotate: '4deg' }] },
  invite: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
  inviteText: { flex: 1 },
  inviteAction: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  actions: { paddingHorizontal: Spacing.screen, paddingBottom: Spacing.three, gap: Spacing.two },
});
