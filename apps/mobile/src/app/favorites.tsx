import { router } from 'expo-router';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { OfflineBanner } from '@/components/offline-banner';
import { ParkRow } from '@/components/park-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useFavoriteParks } from '@/hooks/use-parks';
import { errorMessage } from '@/lib/api';

/** Figma 05 / Saved / Favorite Parks. */
export default function FavoritesScreen() {
  const { data: parks, error, isPending } = useFavoriteParks();

  return (
    <Screen underHeader title="Lemmikpargid" subtitle="Paigad, kuhu ikka tagasi tulla.">
      <OfflineBanner />
      {error && !parks ? <FormError message={errorMessage(error)} /> : null}
      {isPending ? <ThemedText themeColor="muted">Laen…</ThemedText> : null}
      {parks?.length === 0 ? (
        <>
          <ThemedText themeColor="muted">Lemmikuid veel pole. Vajuta pargi lehel südamele.</ThemedText>
          <Button label="Avasta parke" variant="secondary" onPress={() => router.navigate('/map')} />
        </>
      ) : null}
      {parks?.map((park) => <ParkRow key={park.id} park={park} />)}
    </Screen>
  );
}
