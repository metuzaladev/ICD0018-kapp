import type { Product } from '@kapp/shared';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { DiscountPill } from '@/components/discount-pill';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { photoSource } from '@/hooks/use-photos';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice } from '@/lib/format';

/**
 * Figma "Product Card" (58:136): photo, name, price and the paw discount. The whole card opens the
 * product ("Lunasta X käpaga" lives there), so the Figma "+" corner button is not a separate target.
 * Products without an image (the seed has none) get the category icon on the soft colour.
 */
export function ProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
  const c = useTheme();
  const { t } = useTranslation();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t('shop.productA11y', {
        name: product.name,
        price: formatPrice(product.priceCents),
        percent: product.discountPercent,
        partner: product.provider.name,
      })}
      onPress={onPress}
      style={styles.card}>
      <View style={[styles.photo, { backgroundColor: c.soft }]}>
        {product.imageUrl ? (
          <Image source={photoSource(product.imageUrl)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessible={false} />
        ) : (
          <Icon name="shopping-bag" size={36} color={c.brand} />
        )}
      </View>
      <ThemedText type="label" numberOfLines={2}>
        {product.name}
      </ThemedText>
      <View style={styles.price}>
        <ThemedText type="label">{formatPrice(product.priceCents)}</ThemedText>
        <DiscountPill percent={product.discountPercent} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { flexBasis: '47%', flexGrow: 1, gap: Spacing.one },
  photo: { width: '100%', aspectRatio: 1, borderRadius: Radius[16], overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.one },
  price: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
