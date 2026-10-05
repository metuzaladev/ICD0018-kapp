import type { Dog } from '@kapp/shared';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { DogAvatar } from '@/components/dog-avatar';
import { FormError } from '@/components/form-error';
import { ListRow } from '@/components/list-row';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useMyDogs } from '@/hooks/use-dogs';
import { useHealthRecords } from '@/hooks/use-health';
import { photoSource, useDogPhotos } from '@/hooks/use-photos';
import { errorMessage } from '@/lib/api';
import { DOG_SEX_LABEL, dueLabel, formatDate } from '@/lib/format';

/** "4 a", "7 kuud" — age from the birth date, for the profile facts. */
function ageLabel(birthDate: string, now = new Date()): string {
  const [y, m] = birthDate.split('-').map(Number);
  const months = (now.getFullYear() - y!) * 12 + (now.getMonth() + 1 - m!);
  return months >= 12 ? `${Math.floor(months / 12)} a` : `${Math.max(months, 0)} kuud`;
}

/** Figma 04 / Dog / Profile: picture, facts, links to photos and health, "Muuda". */
export default function DogProfileScreen() {
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const { data: dogs, error, isPending } = useMyDogs();
  const dog = dogs?.find((d) => d.id === dogId);

  return (
    <>
      <Stack.Screen options={{ title: dog?.name ?? '' }} />
      <Screen underHeader>
        <OfflineBanner />
        {error && !dogs ? <FormError message={errorMessage(error)} /> : null}
        {isPending ? <ThemedText themeColor="muted">Laen…</ThemedText> : null}
        {dogs && !dog ? <FormError message="Koera ei leitud" /> : null}
        {dog ? <DogProfile dog={dog} /> : null}
      </Screen>
    </>
  );
}

function DogProfile({ dog }: { dog: Dog }) {
  const photos = useDogPhotos(dog.id);
  const health = useHealthRecords(dog.id);
  const facts = [
    dog.breed,
    dog.sex ? DOG_SEX_LABEL[dog.sex] : null,
    dog.birthDate ? ageLabel(dog.birthDate) : null,
    dog.weightKg ? `${dog.weightKg.toLocaleString('et-EE')} kg` : null,
  ].filter(Boolean);
  // The soonest upcoming (or overdue) due date, as a hint on the health row.
  const nextDue = health.data
    ?.map((r) => r.nextDue)
    .filter((d): d is string => d !== null)
    .sort()[0];
  const photoCount = photos.data?.length;

  return (
    <>
      {dog.profilePhoto ? (
        <Image
          source={photoSource(dog.profilePhoto.url)}
          placeholder={photoSource(dog.profilePhoto.thumbnailUrl)}
          style={styles.hero}
          contentFit="cover"
          transition={200}
          accessibilityLabel={`${dog.name} profiilipilt`}
        />
      ) : (
        <View style={styles.center}>
          <DogAvatar dog={dog} size={120} />
        </View>
      )}

      <ThemedText type="title" accessibilityRole="header">
        {dog.name}
      </ThemedText>
      {facts.length > 0 ? <ThemedText themeColor="muted">{facts.join(' · ')}</ThemedText> : null}
      {dog.birthDate ? (
        <ThemedText type="caption" themeColor="muted">
          Sündinud {formatDate(dog.birthDate)}
        </ThemedText>
      ) : null}
      {dog.temperament ? (
        <ThemedView type="soft" style={styles.card}>
          <ThemedText type="caption" themeColor="muted">
            ISELOOM
          </ThemedText>
          <ThemedText>{dog.temperament}</ThemedText>
        </ThemedView>
      ) : null}

      <ListRow
        title="Fotod"
        subtitle={photoCount === undefined ? null : photoCount === 0 ? 'Lisa esimene foto' : `${photoCount} fotot`}
        onPress={() => router.push({ pathname: '/dogs/[dogId]/photos', params: { dogId: dog.id } })}
      />
      <ListRow
        title="Tervis ja vaktsiinid"
        subtitle={nextDue ? `Järgmine tähtaeg ${dueLabel(nextDue)}` : 'Ainult sinule nähtav'}
        alert={nextDue ? dueLabel(nextDue).endsWith('hilinenud') : false}
        onPress={() => router.push({ pathname: '/dogs/[dogId]/health', params: { dogId: dog.id } })}
      />
      <Button label="Muuda" variant="secondary" onPress={() => router.push({ pathname: '/dogs/edit', params: { dogId: dog.id } })} />
    </>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius[24] },
  center: { alignItems: 'center', paddingVertical: Spacing.two },
  card: { padding: Spacing.three, borderRadius: Radius[16], gap: Spacing.one },
});
