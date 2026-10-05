import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { DogAvatar } from '@/components/dog-avatar';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useMyDogs } from '@/hooks/use-dogs';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { ageLabel, formatKg } from '@/lib/format';

/** Figma 04 / Dogs / My Dogs: thumbnail and "Cardigan corgi · 5 kuud · 12 kg"; a row opens the profile. */
export default function MyDogsScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const { data: dogs, error, isPending } = useMyDogs();

  return (
    <Screen underHeader title={t('dogs.list.title')} subtitle={t('dogs.list.subtitle')}>
      {error && !dogs ? <FormError message={errorMessage(error)} /> : null}
      {isPending ? <ThemedText themeColor="muted">{t('common.loading')}</ThemedText> : null}
      {dogs?.length === 0 ? (
        <ThemedView type="soft" style={styles.card}>
          <ThemedText type="label">{t('dogs.list.emptyTitle')}</ThemedText>
          <ThemedText type="caption" themeColor="muted">
            {t('dogs.list.emptyBody')}
          </ThemedText>
        </ThemedView>
      ) : null}

      {dogs?.map((dog) => (
        <Pressable
          key={dog.id}
          accessibilityRole="button"
          accessibilityLabel={t('dogs.list.openA11y', { name: dog.name })}
          onPress={() => router.push({ pathname: '/dogs/[dogId]', params: { dogId: dog.id } })}
          style={({ pressed }) => [styles.row, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.8 : 1 }]}>
          <DogAvatar dog={dog} />
          <View style={styles.text}>
            <ThemedText type="label">{dog.name}</ThemedText>
            <ThemedText type="caption" themeColor="muted">
              {[dog.breed, dog.birthDate ? ageLabel(dog.birthDate) : null, dog.weightKg ? formatKg(dog.weightKg) : null]
                .filter(Boolean)
                .join(' · ') || t('dogs.list.noDetails')}
            </ThemedText>
          </View>
          <ThemedText type="heading" themeColor="muted" accessibilityElementsHidden>
            ›
          </ThemedText>
        </Pressable>
      ))}

      <Button label={t('dogs.list.add')} variant="secondary" onPress={() => router.push('/dogs/edit')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius[16], gap: 2 },
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
