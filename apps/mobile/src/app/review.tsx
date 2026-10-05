import { reviewInputSchema } from '@kapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useSubmitReview } from '@/hooks/use-visits';
import { errorMessage } from '@/lib/api';
import { validateForm } from '@/lib/form';
import { haptic } from '@/lib/haptics';

/** Figma 03 / Visit / Add Review — modal. Writing again replaces the previous review. */
export default function ReviewScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const { parkId, parkName } = useLocalSearchParams<{ parkId: string; parkName?: string }>();
  const submitReview = useSubmitReview(parkId);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const { data, errors } = validateForm(reviewInputSchema, { rating, body });
    if (!data) return setError(errors.rating ? t('review.chooseRating') : (Object.values(errors)[0] ?? t('errors.checkChoices')));
    setError(null);
    try {
      await submitReview.mutateAsync(data);
      haptic('success');
      AccessibilityInfo.announceForAccessibility(t('review.saved'));
      router.back();
    } catch (e) {
      haptic('error');
      setError(errorMessage(e));
    }
  }

  return (
    <Screen underHeader title={t('review.title')} subtitle={parkName}>
      <FormError message={error} />
      <ThemedText themeColor="muted">{t('review.hint')}</ThemedText>
      {/*
        One adjustable element for VoiceOver (swipe up/down changes the rating, HIG), instead of
        five separate star buttons; touch users still tap a star.
      */}
      <View
        style={styles.stars}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('review.ratingLabel')}
        accessibilityValue={{ min: 0, max: 5, now: rating, text: t('review.ratingA11y', { rating }) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const next = e.nativeEvent.actionName === 'increment' ? Math.min(rating + 1, 5) : Math.max(rating - 1, 1);
          if (next !== rating) haptic('selection');
          setRating(next);
        }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <PressableScale
            key={n}
            accessibilityRole="button"
            accessibilityLabel={t('review.star', { count: n })}
            accessibilityState={{ selected: rating >= n }}
            onPress={() => {
              haptic('selection');
              setRating(n);
            }}
            style={styles.star}>
            <ThemedText type="hero" style={{ color: rating >= n ? c.brand : c.border }}>
              ★
            </ThemedText>
          </PressableScale>
        ))}
      </View>
      <TextField
        label={t('review.experience')}
        placeholder={t('review.experiencePlaceholder')}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={1000}
      />
      <Button label={t('review.submit')} loading={submitReview.isPending} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', justifyContent: 'center' },
  star: { minWidth: 52, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
});
