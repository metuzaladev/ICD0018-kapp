import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Entering } from '@/components/entering';
import { PawBackground } from '@/components/paw-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { onboarding } from '@/lib/onboarding';

const PAGES = ['discover', 'connect'] as const;
type Page = (typeof PAGES)[number];

/** Figma "01 / 02": two-digit counter. Digits and a slash only, so it is not translated text. */
const counter = (index: number) => `${String(index + 1).padStart(2, '0')} / ${String(PAGES.length).padStart(2, '0')}`;

/** Figma Onboarding / Connect: an illustrative plan card (sample data, like the Figma frame). */
function SampleCard() {
  const { t } = useTranslation();
  return (
    // Sample content would confuse VoiceOver users ("Freddy?"), so the card is decoration.
    <ThemedView type="surface" style={styles.sample} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <ThemedText type="label">{t('onboarding.connect.sampleTitle')}</ThemedText>
      <ThemedText type="caption" themeColor="muted">
        {t('onboarding.connect.sampleSubtitle')}
      </ThemedText>
    </ThemedView>
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
      <ThemedText type="label" themeColor="muted" accessibilityLabel={t('onboarding.step', { current: index + 1, total: PAGES.length })}>
        {counter(index)}
      </ThemedText>
      {page === 'discover' ? (
        <Image
          source={require('@/assets/images/park-placeholder.jpg')}
          style={styles.photo}
          contentFit="cover"
          accessibilityLabel={t('onboarding.discover.photoLabel')}
        />
      ) : (
        <View style={styles.illustration}>
          <Image
            source={require('@/assets/images/welcome-dog.jpg')}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessible={false}
            accessibilityElementsHidden
          />
          <SampleCard />
        </View>
      )}
      <Entering index={1}>
        <ThemedText type="hero" accessibilityRole="header">
          {t(`onboarding.${page}.title`)}
        </ThemedText>
      </Entering>
      <Entering index={2}>
        <ThemedText themeColor="muted">{t(`onboarding.${page}.body`)}</ThemedText>
      </Entering>
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
              <Button label={t('onboarding.createAccount')} onPress={() => finish('/sign-up')} />
              <Button label={t('auth.welcome.haveAccount')} variant="secondary" onPress={() => finish('/sign-in')} />
            </>
          ) : (
            <>
              <Button label={t('onboarding.next')} onPress={() => goTo(index + 1)} />
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
  photo: { flex: 1, minHeight: 200, borderRadius: Radius[16] },
  illustration: { flex: 1, minHeight: 200, borderRadius: Radius[16], overflow: 'hidden', justifyContent: 'flex-end', padding: Spacing.three },
  sample: { padding: Spacing.three, borderRadius: Radius[16], gap: 2 },
  actions: { paddingHorizontal: Spacing.screen, paddingBottom: Spacing.three, gap: Spacing.two },
});
