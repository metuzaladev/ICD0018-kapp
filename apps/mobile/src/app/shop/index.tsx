import { MAX_DISCOUNT_PERCENT, type ProductCategory, type ServiceCategory, type ShopPartner } from '@kapp/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { DiscountPill } from '@/components/discount-pill';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Icon } from '@/components/icon';
import { ChipRow, IconChip } from '@/components/icon-chip';
import type { IconName } from '@/components/icon-sources';
import { ListRow } from '@/components/list-row';
import { MiniMap } from '@/components/mini-map';
import { OfflineBanner } from '@/components/offline-banner';
import { PhotoTile } from '@/components/photo-tile';
import { PressableScale } from '@/components/pressable-scale';
import { ProductCard } from '@/components/product-card';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { usePointsBalance } from '@/hooks/use-points';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useProducts, useShop } from '@/hooks/use-shop';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { formatKm, pawsLabel, priceLabel } from '@/lib/format';
import { providerPlaceKind } from '@/lib/map-categories';
import { SAMPLE_DOGS } from '@/lib/sample-dogs';
import { focusMap } from '@/state/explore-view';

type Tab = 'services' | 'products';

/**
 * Figma category tiles (Hooldus, Treening, Tervis). The photos are the bundled Unsplash sample dogs
 * (docs/05): illustrations of a service kind, never presented as a user or a partner.
 */
const SERVICE_TILES: { category: Exclude<ServiceCategory, 'other'>; image: number }[] = [
  { category: 'grooming', image: SAMPLE_DOGS.bella },
  { category: 'training', image: SAMPLE_DOGS.charlie },
  { category: 'vet', image: SAMPLE_DOGS.luna },
];

const PRODUCT_ICON: Record<ProductCategory, IconName> = {
  food: 'shopping-bag',
  treats: 'cookie',
  toys: 'sparkles',
  accessories: 'dog',
  care: 'droplet',
};

/** Figma "List Row / Käpakoda": photo, name, "Hooldus · Kadriorg · alates 12 €", "−15%". */
function PartnerRow({ partner }: { partner: ShopPartner }) {
  const c = useTheme();
  const { t } = useTranslation();
  const meta = [
    t(`services.categories.${partner.category}`),
    partner.area,
    formatKm(partner.distanceKm),
    partner.priceFromCents !== null ? priceLabel(partner.priceFromCents, true) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${partner.name}, ${meta}, ${t('shop.discountA11y', { percent: partner.pawDiscountPercent, paws: pawsLabel(partner.pointsCost) })}`}
      accessibilityHint={t('shop.partnerHint')}
      onPress={() => router.push({ pathname: '/services/[providerId]', params: { providerId: partner.id } })}
      style={[styles.partner, { backgroundColor: c.surface, borderColor: c.border }]}>
      {partner.photoUrl ? (
        <Image source={{ uri: partner.photoUrl }} style={styles.partnerPhoto} contentFit="cover" accessible={false} />
      ) : (
        <PhotoTile name={partner.name} size={48} radius={14} />
      )}
      <View style={styles.flex}>
        <ThemedText type="label">{partner.name}</ThemedText>
        <ThemedText type="caption" themeColor="muted">
          {meta}
        </ThemedText>
      </View>
      <DiscountPill percent={partner.pawDiscountPercent} />
    </PressableScale>
  );
}

/**
 * Figma 09 / Marketplace / Pood (85:8362): Teenused / Tooted, the balance, category tiles, the
 * partners on a mini map, partners with paw discounts and partner products. No payments: points
 * buy a single-use discount code that the partner checks in person (docs/16).
 */
export default function ShopScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const location = useDeviceLocation();
  const shop = useShop(location.usingFallback ? null : location.origin);
  const [tab, setTab] = useState<Tab>('services');
  const [productCategory, setProductCategory] = useState<ProductCategory | null>(null);
  const products = useProducts(productCategory);
  const balance = usePointsBalance();
  const refresh = usePullToRefresh(shop.refetch, products.refetch);
  const data = shop.data;
  // The largest discount on offer, from the data (falls back to the rule's maximum while loading).
  const maxDiscount = Math.max(0, ...(data?.partners.map((p) => p.pawDiscountPercent) ?? []), ...(data?.products.map((p) => p.discountPercent) ?? [])) || MAX_DISCOUNT_PERCENT;
  const openMap = () => {
    // The Kaart tab opens on the map with the Teenused chip selected (state/explore-view.ts).
    focusMap({ category: 'services' });
    router.navigate('/map');
  };
  const openProduct = (productId: string) => router.push({ pathname: '/shop/[productId]', params: { productId } });

  return (
    <Screen underHeader title={t('shop.title')} subtitle={t('shop.subtitle')} refresh={refresh}>
      <OfflineBanner />
      <SegmentedControl
        accessibilityLabel={t('shop.title')}
        options={[
          { value: 'services', label: t('shop.tabServices') },
          { value: 'products', label: t('shop.tabProducts') },
        ]}
        value={tab}
        onChange={(v) => v && setTab(v)}
      />

      {balance !== null ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${t('shop.balance', { paws: pawsLabel(balance) })}, ${t('shop.balanceSub', { percent: maxDiscount })}`}
          accessibilityHint={t('points.openHint')}
          onPress={() => router.push('/rewards')}
          style={[styles.balance, { backgroundColor: c.soft }]}>
          <View style={styles.flex}>
            <ThemedText type="heading">{t('shop.balance', { paws: pawsLabel(balance) })}</ThemedText>
            <ThemedText type="caption" themeColor="muted">
              {t('shop.balanceSub', { percent: maxDiscount })}
            </ThemedText>
          </View>
          <Icon name="paw-print" size={28} color={c.brand} />
        </PressableScale>
      ) : null}
      <ListRow icon="ticket" title={t('shop.myCodes')} subtitle={t('shop.myCodesSub')} onPress={() => router.push('/redemptions')} />

      {shop.error && !data ? <ErrorState message={errorMessage(shop.error)} onRetry={() => void shop.refetch()} retrying={shop.isFetching} /> : null}
      {shop.isPending ? <SkeletonList rows={3} rowHeight={96} /> : null}

      {data && tab === 'services' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.tiles}>
            {SERVICE_TILES.map((tile) => (
              <PressableScale
                key={tile.category}
                accessibilityRole="button"
                accessibilityLabel={t(`shop.tiles.${tile.category}`)}
                accessibilityHint={t('shop.tileHint')}
                onPress={() => router.push({ pathname: '/services', params: { category: tile.category } })}
                style={styles.tile}>
                <Image source={tile.image} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
                <View style={styles.tileShade} />
                <ThemedText type="label" style={styles.tileLabel}>
                  {t(`shop.tiles.${tile.category}`)}
                </ThemedText>
              </PressableScale>
            ))}
          </ScrollView>

          <View style={styles.sectionHead}>
            <ThemedText type="heading" accessibilityRole="header" style={styles.flex}>
              {t('shop.nearbyMap')}
            </ThemedText>
            <PressableScale accessibilityRole="button" accessibilityLabel={t('shop.openMap')} accessibilityHint={t('shop.openMapHint')} onPress={openMap} style={styles.link}>
              <ThemedText type="label" style={{ color: c.accent }}>
                {t('shop.openMap')}
              </ThemedText>
            </PressableScale>
          </View>
          {/* The preview opens the map too; VoiceOver reaches the same action through "Ava kaart". */}
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t('shop.openMap')}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onPress={openMap}>
            <MiniMap center={location.origin} pins={data.partners.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, kind: providerPlaceKind(p.category) }))} />
          </PressableScale>

          <ThemedText type="heading" accessibilityRole="header">
            {t('shop.popularServices')}
          </ThemedText>
          {data.partners.length === 0 ? <EmptyState title={t('shop.noPartners')} /> : null}
          {data.partners.map((partner) => (
            <PartnerRow key={partner.id} partner={partner} />
          ))}

          {data.products.length > 0 ? (
            <>
              <ThemedText type="heading" accessibilityRole="header">
                {t('shop.partnerProducts')}
              </ThemedText>
              <View style={styles.grid}>
                {data.products.slice(0, 4).map((product) => (
                  <ProductCard key={product.id} product={product} onPress={() => openProduct(product.id)} />
                ))}
              </View>
              <Button label={t('shop.allProducts')} variant="tertiary" onPress={() => setTab('products')} />
            </>
          ) : null}
        </>
      ) : null}

      {data && tab === 'products' ? (
        <>
          <ChipRow radiogroup>
            <IconChip role="radio" icon="layers" label={t('shop.productCategories.all')} selected={productCategory === null} onPress={() => setProductCategory(null)} />
            {data.categories
              .filter((cat) => cat.productCount > 0)
              .map((cat) => (
                <IconChip
                  key={cat.id}
                  role="radio"
                  icon={PRODUCT_ICON[cat.id]}
                  label={t(`shop.productCategories.${cat.id}`)}
                  selected={productCategory === cat.id}
                  onPress={() => setProductCategory(cat.id)}
                />
              ))}
          </ChipRow>
          {products.error && !products.data ? <ErrorState message={errorMessage(products.error)} onRetry={() => void products.refetch()} retrying={products.isFetching} /> : null}
          {products.isPending ? <SkeletonList rows={2} rowHeight={200} /> : null}
          {products.data && products.data.length === 0 ? <EmptyState title={t('shop.noProducts')} /> : null}
          <View style={styles.grid}>
            {products.data?.map((product) => (
              <ProductCard key={product.id} product={product} onPress={() => openProduct(product.id)} />
            ))}
          </View>
        </>
      ) : null}

      <ThemedText type="caption" themeColor="muted">
        {t('shop.noPayments')}
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  balance: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius[16] },
  bleed: { marginHorizontal: -Spacing.screen, flexGrow: 0 },
  tiles: { gap: 10, paddingHorizontal: Spacing.screen },
  // Photo tiles: the label wraps inside and the tile grows (minHeight), the width is the image's.
  tile: { width: 124, minHeight: 96, borderRadius: Radius[16], overflow: 'hidden', justifyContent: 'flex-end', padding: 12 },
  tileShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.28)' },
  // White on a darkened photo (Figma); not a theme colour because the photo is the background.
  tileLabel: { color: '#FFFFFF' },
  sectionHead: { flexDirection: 'row', alignItems: 'center' },
  link: { minHeight: 44, justifyContent: 'center' },
  partner: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: Spacing.three, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth },
  partnerPhoto: { width: 48, height: 48, borderRadius: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
});
