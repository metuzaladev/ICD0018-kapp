import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { DogAvatar } from '@/components/dog-avatar';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useMyDogs } from '@/hooks/use-dogs';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { DOG_SEX_LABEL } from '@/lib/format';

/** Figma 04 / Dogs / My Dogs: profile thumbnail, basic data; a row opens the dog's profile. */
export default function MyDogsScreen() {
  const c = useTheme();
  const { data: dogs, error, isPending } = useMyDogs();

  return (
    <Screen underHeader title="Sinu parimad sõbrad" subtitle="Koerad, kellega parki lähed.">
      {error && !dogs ? <FormError message={errorMessage(error)} /> : null}
      {isPending ? <ThemedText themeColor="muted">Laen…</ThemedText> : null}
      {dogs?.length === 0 ? <ThemedText themeColor="muted">Lisa oma esimene koer, et saaksid pargis kohalolekut märkida.</ThemedText> : null}

      {dogs?.map((dog) => (
        <Pressable
          key={dog.id}
          accessibilityRole="button"
          accessibilityLabel={`${dog.name}, ava profiil`}
          onPress={() => router.push({ pathname: '/dogs/[dogId]', params: { dogId: dog.id } })}
          style={({ pressed }) => [styles.row, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.8 : 1 }]}>
          <DogAvatar dog={dog} />
          <View style={styles.text}>
            <ThemedText type="label">{dog.name}</ThemedText>
            <ThemedText type="caption" themeColor="muted">
              {[dog.breed, dog.sex ? DOG_SEX_LABEL[dog.sex] : null, dog.weightKg ? `${dog.weightKg.toLocaleString('et-EE')} kg` : null]
                .filter(Boolean)
                .join(' · ') || 'Lisa tõug ja muud andmed'}
            </ThemedText>
          </View>
          <ThemedText type="heading" themeColor="muted" accessibilityElementsHidden>
            ›
          </ThemedText>
        </Pressable>
      ))}

      <Button label="Lisa koer" variant="secondary" onPress={() => router.push('/dogs/edit')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius[16],
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 2 },
});
