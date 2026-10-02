import { SERVICE_CATEGORIES, type ServiceCategory } from '@kapp/shared';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChipRow, IconChip } from '@/components/icon-chip';
import type { IconName } from '@/components/icon';
import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { OfflineBanner } from '@/components/offline-banner';
import { ProviderRow } from '@/components/provider-row';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useProviders } from '@/hooks/use-services';
import { errorMessage } from '@/lib/api';

/** Figma chips; "Muu" exists in the data model but has no providers, so it gets no chip. */
const CATEGORIES: (ServiceCategory | null)[] = [null, 'grooming', 'training', 'vet'];
const CATEGORY_ICON: Record<ServiceCategory | 'all', IconName> = {
  all: 'layers',
  grooming: 'scissors',
  training: 'footprints',
  vet: 'stethoscope',
  other: 'sparkles',
};

/**
 * Figma 06 / Services / Discover: category chips and providers nearest first. The location is the
 * same rounded device position as the park list (Tallinn centre without permission), never exact.
 */
export default function ServicesScreen() {
  const { t } = useTranslation();
  const location = useDeviceLocation();
  // Pood's category tiles open the list on a category (`?category=grooming`).
  const { category: initial } = useLocalSearchParams<{ category?: string }>();
  const [category, setCategory] = useState<ServiceCategory | null>(
    (SERVICE_CATEGORIES as readonly string[]).includes(initial ?? '') ? (initial as ServiceCategory) : null,
  );
  const providers = useProviders(category, location.origin);
  const refresh = usePullToRefresh(providers.refetch);

  return (
    <Screen underHeader title={t('services.title')} subtitle={t('services.subtitle')} refresh={refresh}>
      <OfflineBanner />
      <ChipRow radiogroup>
        {CATEGORIES.map((key) => (
          <IconChip
            key={key ?? 'all'}
            role="radio"
            icon={CATEGORY_ICON[key ?? 'all']}
            label={t(`services.categories.${key ?? 'all'}`)}
            selected={category === key}
            onPress={() => setCategory(key)}
          />
        ))}
      </ChipRow>

      {providers.error && !providers.data ? (
        <ErrorState message={errorMessage(providers.error)} onRetry={() => void providers.refetch()} retrying={providers.isFetching} />
      ) : null}
      {providers.isPending ? <SkeletonList rowHeight={88} /> : null}
      {providers.data?.length === 0 ? <EmptyState title={t('services.empty')} /> : null}
      {providers.data?.map((provider, i) => (
        <Entering key={provider.id} index={i}>
          <ProviderRow provider={provider} />
        </Entering>
      ))}

      <ThemedText type="caption" themeColor="muted">
        {/* Honest about the demo data (Figma: "… on disaini näidisandmed"). */}
        {t('services.demoNote')}
        {location.usingFallback ? ` ${t('services.distanceNote')}` : ''}
      </ThemedText>
    </Screen>
  );
}
