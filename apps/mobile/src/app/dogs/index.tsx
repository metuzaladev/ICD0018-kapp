import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { DogAvatar } from '@/components/dog-avatar';
import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useMyDogs } from '@/hooks/use-dogs';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { ageLabel, formatKg } from '@/lib/format';

/** Figma 04 / Dogs / My Dogs: thumbnail and "Cardigan corgi · 5 kuud · 12 kg"; a row opens the profile. */
export default function MyDogsScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const query = useMyDogs();
  const { data: dogs, error, isPending } = query;
  const refresh = usePullToRefresh(query.refetch);

  return (
    <Screen underHeader title={t('dogs.list.title')} subtitle={t('dogs.list.subtitle')} refresh={refresh}>
      {error && !dogs ? <ErrorState message={errorMessage(error)} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
      {isPending ? <SkeletonList rows={2} /> : null}
      {dogs?.length === 0 ? <EmptyState title={t('dogs.list.emptyTitle')} body={t('dogs.list.emptyBody')} /> : null}

      {dogs?.map((dog, i) => {
        const details =
          [dog.breed, dog.birthDate ? ageLabel(dog.birthDate) : null, dog.weightKg ? formatKg(dog.weightKg) : null].filter(Boolean).join(' · ') ||
          t('dogs.list.noDetails');
        return (
          <Entering key={dog.id} index={i}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`${dog.name}, ${details}`}
              accessibilityHint={t('dogs.list.openHint')}
              onPress={() => router.push({ pathname: '/dogs/[dogId]', params: { dogId: dog.id } })}
              style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
              <DogAvatar dog={dog} />
              <View style={styles.text}>
                <ThemedText type="label">{dog.name}</ThemedText>
                <ThemedText type="caption" themeColor="muted">
                  {details}
                </ThemedText>
              </View>
              <ThemedText type="heading" themeColor="muted" accessibilityElementsHidden>
                ›
              </ThemedText>
            </PressableScale>
          </Entering>
        );
      })}

      <Button label={t('dogs.list.add')} variant="secondary" onPress={() => router.push('/dogs/edit')} />
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
