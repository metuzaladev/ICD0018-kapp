import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { useMyDogs } from '@/hooks/use-dogs';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { errorMessage } from '@/lib/api';
import { ageLabel, formatKg } from '@/lib/format';

/** Figma 04 / Dogs / My Dogs: rounded-square photo (List Row photo variant) and "Cardigan corgi · 5 kuud · 12 kg"; a row opens the profile. */
export default function MyDogsScreen() {
  const { t } = useTranslation();
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
            <ListRow
              title={dog.name}
              subtitle={details}
              photo={{ uri: dog.profilePhoto?.thumbnailUrl, name: dog.name }}
              accessibilityHint={t('dogs.list.openHint')}
              onPress={() => router.push({ pathname: '/dogs/[dogId]', params: { dogId: dog.id } })}
            />
          </Entering>
        );
      })}

      <Button label={t('dogs.list.add')} variant="secondary" onPress={() => router.push('/dogs/edit')} />
    </Screen>
  );
}

