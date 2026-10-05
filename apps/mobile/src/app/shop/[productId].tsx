import { REDEMPTION_VALID_DAYS } from '@kapp/shared';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { DiscountPill } from '@/components/discount-pill';
import { ErrorState } from '@/components/error-state';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { InfoCard } from '@/components/info-card';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { photoSource } from '@/hooks/use-photos';
import { usePointsBalance } from '@/hooks/use-points';
import { useRedeemOnce } from '@/hooks/use-redeem-once';
import { useProduct } from '@/hooks/use-shop';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { formatNumber, formatPrice, pawsLabel } from '@/lib/format';
import { haptic } from '@/lib/haptics';

/**
 * A partner product (from a Product Card): price at the partner, the paw discount and
 * "Lunasta X käpaga", which spends the points for a single-use code (no payment in the app).
 * Cost, discount and the discounted price all come from the server.
 */
export default function ProductScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const query = useProduct(productId);
  const balance = usePointsBalance();
  const redeem = useRedeemOnce();
  const [error, setError] = useState<string | null>(null);
  const product = query.data;

  if (!product) {
    return (
      <Screen underHeader>
        {query.error ? <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
        {query.isPending ? <SkeletonList rows={2} rowHeight={160} /> : null}
      </Screen>
    );
  }

  const short = balance !== null ? product.pointsCost - balance : 0;

  function confirm() {
    if (!product) return;
    setError(null);
    Alert.alert(
      t('shop.confirmTitle'),
      t('shop.confirmBody', { paws: pawsLabel(product.pointsCost), percent: product.discountPercent, partner: product.provider.name, count: REDEMPTION_VALID_DAYS }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('shop.confirmAction'),
          onPress: async () => {
            try {
              const redemption = await redeem.run({ offerType: 'product', offerId: product.id });
              haptic('success');
              router.replace({ pathname: '/redemptions/[redemptionId]', params: { redemptionId: redemption.id, fresh: '1' } });
            } catch (e) {
              // 409 "Käppasid ei ole piisavalt: vaja 150, sul on 40" — already in the user's language.
              haptic('error');
              setError(errorMessage(e));
            }
          },
        },
      ],
    );
  }

  return (
    <Screen underHeader title={product.name} subtitle={`${product.provider.name} · ${product.provider.area}`}>
      <OfflineBanner />
      <View style={[styles.photo, { backgroundColor: c.soft }]}>
        {product.imageUrl ? (
          <Image source={photoSource(product.imageUrl)} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
        ) : (
          <Icon name="shopping-bag" size={56} color={c.brand} />
        )}
      </View>
      {product.description ? <ThemedText>{product.description}</ThemedText> : null}

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]} accessible>
        <View style={styles.row}>
          <ThemedText themeColor="muted" style={styles.flex}>
            {t('shop.priceAtPartner')}
          </ThemedText>
          <ThemedText type="label">{formatPrice(product.priceCents)}</ThemedText>
        </View>
        <View style={styles.row}>
          <View style={[styles.flex, styles.inline]}>
            <ThemedText themeColor="muted">{t('shop.priceWithPaws')}</ThemedText>
            <DiscountPill percent={product.discountPercent} />
          </View>
          <ThemedText type="heading">{formatPrice(product.discountedPriceCents)}</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText themeColor="muted" style={styles.flex}>
            {t('shop.cost')}
          </ThemedText>
          <ThemedText type="label">{pawsLabel(product.pointsCost)}</ThemedText>
        </View>
      </View>

      <FormError message={error} />
      {balance !== null ? (
        <ThemedText themeColor={short > 0 ? 'danger' : 'muted'}>
          {short > 0 ? t('shop.short', { paws: pawsLabel(short) }) : t('shop.youHave', { paws: pawsLabel(balance) })}
        </ThemedText>
      ) : null}
      <Button
        label={t('shop.redeem', { count: product.pointsCost, value: formatNumber(product.pointsCost) })}
        loading={redeem.isPending}
        disabled={short > 0}
        onPress={confirm}
      />
      <InfoCard title={t('shop.howTitle')} body={t('shop.howBody', { count: REDEMPTION_VALID_DAYS })} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius[24], overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  card: { padding: Spacing.three, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
