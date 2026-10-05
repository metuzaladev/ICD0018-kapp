import { reviewInputSchema } from '@kapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useSubmitReview } from '@/hooks/use-visits';
import { errorMessage } from '@/lib/api';
import { validateForm } from '@/lib/form';

/** Figma 03 / Visit / Add Review — modal. Writing again replaces the previous review. */
export default function ReviewScreen() {
  const c = useTheme();
  const { parkId, parkName } = useLocalSearchParams<{ parkId: string; parkName?: string }>();
  const submitReview = useSubmitReview(parkId);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const { data, errors } = validateForm(reviewInputSchema, { rating, body });
    if (!data) return setError(errors.rating ? 'Vali hinne 1–5' : (Object.values(errors)[0] ?? 'Kontrolli välju'));
    setError(null);
    try {
      await submitReview.mutateAsync(data);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Screen underHeader title={parkName ?? 'Hinda parki'} subtitle="Sinu hinnang aitab teistel õige pargi valida.">
      <FormError message={error} />
      <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={`Hinne ${rating} viiest`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`${n} tärni`}
            accessibilityState={{ selected: rating >= n }}
            onPress={() => setRating(n)}
            style={styles.star}>
            <ThemedText type="hero" style={{ color: rating >= n ? c.brand : c.border }}>
              ★
            </ThemedText>
          </Pressable>
        ))}
      </View>
      <TextField
        label="Sinu kogemus (valikuline)"
        placeholder="Näiteks: sõbralikud koerad ja mõnus jalutuskäik"
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={1000}
      />
      <Button label="Salvesta hinnang" loading={submitReview.isPending} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', justifyContent: 'center' },
  star: { minWidth: 52, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
});
