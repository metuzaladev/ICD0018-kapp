import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const { data: parks, error, isPending } = useFavoriteParks();

  return (
    <Screen underHeader title={t('favorites.title')} subtitle={t('favorites.subtitle')}>
      <OfflineBanner />
      {error && !parks ? <FormError message={errorMessage(error)} /> : null}
      {isPending ? <ThemedText themeColor="muted">{t('common.loading')}</ThemedText> : null}
      {parks?.length === 0 ? <ThemedText themeColor="muted">{t('favorites.empty')}</ThemedText> : null}
      {parks?.map((park) => <ParkRow key={park.id} park={park} />)}
      {parks ? <Button label={t('favorites.explore')} variant="secondary" onPress={() => router.navigate('/map')} /> : null}
    </Screen>
  );
}
