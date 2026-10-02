import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ErrorState } from '@/components/error-state';
import { FormError } from '@/components/form-error';
import { InfoCard } from '@/components/info-card';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { SuccessMark } from '@/components/success-mark';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useCancelRedemption, useRedemptions } from '@/hooks/use-shop';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { formatNumericDate, pawsLabel, redemptionTitle } from '@/lib/format';
import { haptic } from '@/lib/haptics';

/**
 * The code to show at the partner (after "Lunasta" or from "Minu koodid"): the big single-use code,
 * the partner, "Kehtib kuni: …" (label form + numeric date, docs/11), how to use it and — while it
 * is unused — "Tühista ja tagasta käpad". There is no single-code endpoint, so it reads the list.
 */
export default function RedemptionScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const { redemptionId, fresh } = useLocalSearchParams<{ redemptionId: string; fresh?: string }>();
  const list = useRedemptions();
  const cancel = useCancelRedemption();
  const [error, setError] = useState<string | null>(null);
  const r = list.data?.find((x) => x.id === redemptionId);

  if (!r) {
    return (
      <Screen underHeader>
        {list.error ? <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} retrying={list.isFetching} /> : null}
        {list.isPending ? <SkeletonList rows={2} rowHeight={120} /> : null}
      </Screen>
    );
  }

  function confirmCancel() {
    if (!r) return;
    haptic('warning');
    Alert.alert(t('redemptions.cancelTitle'), t('redemptions.cancelBody', { paws: pawsLabel(r.pointsCost) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('redemptions.cancelAction'),
        style: 'destructive',
        onPress: async () => {
          setError(null);
          try {
            await cancel.mutateAsync(r.id);
            AccessibilityInfo.announceForAccessibility(t('redemptions.cancelled', { paws: pawsLabel(r.pointsCost) }));
          } catch (e) {
            haptic('error');
            setError(errorMessage(e));
          }
        },
      },
    ]);
  }

  const active = r.status === 'active';
  return (
    <Screen underHeader title={redemptionTitle(r)} subtitle={r.provider.name}>
      <OfflineBanner />
      {fresh && active ? <SuccessMark /> : null}
      <FormError message={error} />
      <View
        style={[styles.codeCard, { backgroundColor: active ? c.brand : c.surface, borderColor: c.border }]}
        accessible
        accessibilityLabel={t('redemptions.codeA11y', { code: r.code.split('').join(' '), status: t(`redemptions.status.${r.status}`) })}>
        <ThemedText type="caption" style={{ color: active ? c.onBrand : c.muted }}>
          {t('redemptions.codeLabel')}
        </ThemedText>
        <ThemedText type="hero" selectable style={[styles.code, { color: active ? c.onBrand : c.muted }]}>
          {r.code}
        </ThemedText>
        <ThemedText type="label" style={{ color: active ? c.onBrand : c.text }}>
          {t(`redemptions.status.${r.status}`)}
        </ThemedText>
        {active ? (
          <ThemedText type="caption" style={{ color: c.onBrand }}>
            {t('redemptions.validUntil', { date: formatNumericDate(r.expiresAt) })}
          </ThemedText>
        ) : null}
      </View>

      <InfoCard
        title={t('redemptions.howTitle')}
        body={r.offerType === 'product' ? t('redemptions.howProduct', { partner: r.provider.name }) : t('redemptions.howBooking', { partner: r.provider.name })}
      />
      {active && r.offerType === 'booking' ? (
        <Button label={t('redemptions.bookNow')} onPress={() => router.push({ pathname: '/services/[providerId]', params: { providerId: r.provider.id } })} />
      ) : null}
      {active ? <Button label={t('redemptions.cancelAction')} variant="secondary" loading={cancel.isPending} onPress={confirmCancel} /> : null}
      <Button label={t('redemptions.allCodes')} variant="tertiary" onPress={() => router.push('/redemptions')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeCard: { padding: Spacing.four, borderRadius: Radius[24], borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', gap: Spacing.two },
  code: { fontFamily: Fonts.mono, letterSpacing: 4, textAlign: 'center' },
});
