import type { ServiceCategory } from '@kapp/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { FormError } from '@/components/form-error';
import { OfflineBanner } from '@/components/offline-banner';
import { ProviderRow } from '@/components/provider-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { useProviders } from '@/hooks/use-services';
import { errorMessage } from '@/lib/api';

/** Figma chips; "Muu" exists in the data model but has no providers, so it gets no chip. */
const CATEGORIES: (ServiceCategory | null)[] = [null, 'grooming', 'training', 'vet'];

/**
 * Figma 06 / Services / Discover: category chips and providers nearest first. The location is the
 * same rounded device position as the park list (Tallinn centre without permission), never exact.
 */
export default function ServicesScreen() {
  const { t } = useTranslation();
  const location = useDeviceLocation();
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const providers = useProviders(category, location.origin);

  return (
    <Screen underHeader title={t('services.title')} subtitle={t('services.subtitle')}>
      <OfflineBanner />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {CATEGORIES.map((key) => (
          // minWidth instead of a fixed width: "Дрессировка" is twice as long as "Treening".
          <View key={key ?? 'all'} style={styles.chip}>
            <Chip label={t(`services.categories.${key ?? 'all'}`)} selected={category === key} onPress={() => setCategory(key)} />
          </View>
        ))}
      </ScrollView>

      {providers.error && !providers.data ? <FormError message={errorMessage(providers.error)} /> : null}
      {providers.isPending ? <ThemedText themeColor="muted">{t('common.loading')}</ThemedText> : null}
      {providers.data?.length === 0 ? <ThemedText themeColor="muted">{t('services.empty')}</ThemedText> : null}
      {providers.data?.map((provider) => <ProviderRow key={provider.id} provider={provider} />)}

      <ThemedText type="caption" themeColor="muted">
        {/* Honest about the demo data (Figma: "… on disaini näidisandmed"). */}
        {t('services.demoNote')}
        {location.usingFallback ? ` ${t('services.distanceNote')}` : ''}
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: Spacing.two },
  chip: { minWidth: 88 },
});
