import type { Dog } from '@kapp/shared';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { DogAvatar } from '@/components/dog-avatar';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { FormError } from '@/components/form-error';
import { ListRow } from '@/components/list-row';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useMyDogs } from '@/hooks/use-dogs';
import { useHealthRecords } from '@/hooks/use-health';
import { photoSource, useDogPhotos } from '@/hooks/use-photos';
import { errorMessage } from '@/lib/api';
import { ageLabel, dogSexLabel, dueLabel, formatDate, formatKg, isOverdue, photosLabel } from '@/lib/format';

/** Figma 04 / Dog / Profile: picture, "Cardigan corgi · isane · 5 kuud", links to photos and health, "Muuda profiili". */
export default function DogProfileScreen() {
  const { t } = useTranslation();
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const query = useMyDogs();
  const { data: dogs, error, isPending } = query;
  const dog = dogs?.find((d) => d.id === dogId);

  return (
    <>
      <Stack.Screen options={{ title: dog?.name ?? '' }} />
      <Screen underHeader>
        <OfflineBanner />
        {error && !dogs ? <ErrorState message={errorMessage(error)} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
        {isPending ? <SkeletonList rows={2} rowHeight={120} /> : null}
        {dogs && !dog ? <FormError message={t('dogs.profile.notFound')} /> : null}
        {dog ? <DogProfile dog={dog} /> : null}
      </Screen>
    </>
  );
}

function DogProfile({ dog }: { dog: Dog }) {
  const { t } = useTranslation();
  const photos = useDogPhotos(dog.id);
  const health = useHealthRecords(dog.id);
  const facts = [
    dog.breed,
    dog.sex ? dogSexLabel(dog.sex) : null,
    dog.birthDate ? ageLabel(dog.birthDate) : null,
    dog.weightKg ? formatKg(dog.weightKg) : null,
  ].filter(Boolean);
  // The soonest upcoming (or overdue) due date, as a hint on the health row.
  const nextDue = health.data
    ?.map((r) => r.nextDue)
    .filter((d): d is string => d !== null)
    .sort()[0];
  const photoCount = photos.data?.length;

  return (
    <>
      <Entering>
        {dog.profilePhoto ? (
          <Image
            source={photoSource(dog.profilePhoto.url)}
            placeholder={photoSource(dog.profilePhoto.thumbnailUrl)}
            style={styles.hero}
            contentFit="cover"
            transition={200}
            accessibilityLabel={t('dogs.profile.photoA11y', { name: dog.name })}
          />
        ) : (
          <View style={styles.center}>
            <DogAvatar dog={dog} size={120} />
          </View>
        )}
      </Entering>

      <ThemedText type="title" accessibilityRole="header">
        {dog.name}
      </ThemedText>
      {facts.length > 0 ? <ThemedText themeColor="muted">{facts.join(' · ')}</ThemedText> : null}
      {dog.birthDate ? (
        <ThemedText type="caption" themeColor="muted">
          {t('dogs.profile.born', { date: formatDate(dog.birthDate) })}
        </ThemedText>
      ) : null}
      {dog.temperament ? (
        <ThemedView type="soft" style={styles.card}>
          <ThemedText type="caption" themeColor="muted">
            {t('dogs.profile.temperament')}
          </ThemedText>
          <ThemedText>{dog.temperament}</ThemedText>
        </ThemedView>
      ) : null}

      <ListRow
        title={t('dogs.profile.photos')}
        subtitle={
          photoCount === undefined
            ? null
            : photoCount === 0
              ? t('dogs.profile.photosEmpty')
              : t('dogs.profile.photosCount', { photos: photosLabel(photoCount) })
        }
        onPress={() => router.push({ pathname: '/dogs/[dogId]/photos', params: { dogId: dog.id } })}
      />
      <ListRow
        title={t('dogs.profile.health')}
        subtitle={nextDue ? t('dogs.profile.nextDue', { due: dueLabel(nextDue) }) : t('dogs.profile.healthPrivate')}
        alert={nextDue ? isOverdue(nextDue) : false}
        onPress={() => router.push({ pathname: '/dogs/[dogId]/health', params: { dogId: dog.id } })}
      />
      <Button
        label={t('dogs.profile.edit')}
        variant="secondary"
        onPress={() => router.push({ pathname: '/dogs/edit', params: { dogId: dog.id } })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius[24] },
  center: { alignItems: 'center', paddingVertical: Spacing.two },
  card: { padding: Spacing.three, borderRadius: Radius[16], gap: Spacing.one },
});
