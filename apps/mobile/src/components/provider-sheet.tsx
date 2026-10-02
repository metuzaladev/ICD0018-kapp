import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ErrorState } from '@/components/error-state';
import { Icon } from '@/components/icon';
import { InfoCard } from '@/components/info-card';
import { PressableScale } from '@/components/pressable-scale';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { usePointsBalance } from '@/hooks/use-points';
import { useProvider, useServiceSlots } from '@/hooks/use-services';
import { useShop } from '@/hooks/use-shop';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { nextFreeSlots } from '@/lib/explore';
import { formatDay, formatRating, formatTimeIn, pawsLabel, priceLabel, reviewsLabel } from '@/lib/format';

/**
 * Figma 09 / Explore / Map + provider sheet (81:7764): tapping a service or clinic pin opens this
 * card over the map instead of leaving it — photo, name, category · area, rating, the next free
 * times (M6 slots of the cheapest service), the paw-discount hint and Teenused / Broneeri.
 *
 * Deviations (docs/11): no heart (providers cannot be favourited in the API); the Figma hint
 * "Teeni 20 käppa" is replaced by the real paw discount — bookings do not earn points (docs/16
 * rules), and the discount amount comes from the shop partners list.
 */
export function ProviderSheet({ providerId, onClose }: { providerId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  const provider = useProvider(providerId);
  const service = provider.data?.services[0];
  const slots = useServiceSlots(service?.id);
  // Partners come with the shop overview (cached for Pood too); no location → by name.
  const partner = useShop(null).data?.partners.find((p) => p.id === providerId);
  const balance = usePointsBalance();
  const [chosen, setChosen] = useState<string | null>(null);
  const p = provider.data;
  const timeZone = slots.data?.timeZone ?? p?.timeZone ?? 'Europe/Tallinn';
  const free = nextFreeSlots(slots.data?.days ?? []);
  const selected = chosen && free.includes(chosen) ? chosen : (free[0] ?? null);
  const slotLabel = (iso: string) => `${formatDay(iso)} ${formatTimeIn(iso, timeZone)}`;
  const capitalised = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

  return (
    <View style={[styles.sheet, { backgroundColor: c.background, borderColor: c.border }]}>
      <View style={[styles.grabber, { backgroundColor: c.border }]} accessibilityElementsHidden importantForAccessibility="no" />
      <PressableScale accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.close} hitSlop={4}>
        <Icon name="x" size={22} color={c.muted} />
      </PressableScale>
      {provider.error ? <ErrorState message={errorMessage(provider.error)} onRetry={() => void provider.refetch()} retrying={provider.isFetching} /> : null}
      {!p && provider.isPending ? <SkeletonList rows={2} rowHeight={72} /> : null}
      {p ? (
        <>
          <View style={styles.head} accessible>
            {p.photoUrl ? (
              <Image source={{ uri: p.photoUrl }} style={styles.photo} contentFit="cover" accessible={false} />
            ) : (
              <View style={[styles.photo, styles.photoEmpty, { backgroundColor: c.soft }]}>
                <Icon name={p.category === 'vet' ? 'stethoscope' : 'scissors'} size={28} color={c.brand} />
              </View>
            )}
            <View style={styles.headText}>
              <ThemedText type="title">{p.name}</ThemedText>
              <ThemedText type="caption" themeColor="muted">
                {[t(`services.kindTitle.${p.category}`), p.area].join(' · ')}
              </ThemedText>
              <ThemedText type="caption" themeColor="muted">
                {[
                  p.ratingAverage !== null ? `${t('services.rating', { rating: formatRating(p.ratingAverage) })} · ${reviewsLabel(p.ratingCount)}` : null,
                  p.priceFromCents !== null ? priceLabel(p.priceFromCents, true) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            </View>
          </View>

          {service ? (
            <>
              <ThemedText type="heading" accessibilityRole="header">
                {t('mapSheet.freeTimes')}
              </ThemedText>
              {slots.isPending ? <SkeletonList rows={1} rowHeight={44} /> : null}
              {slots.data && free.length === 0 ? <ThemedText themeColor="muted">{t('booking.noSlots')}</ThemedText> : null}
              <View style={styles.chips} accessibilityRole="radiogroup">
                {free.map((iso) => (
                  <Chip key={iso} role="radio" label={capitalised(slotLabel(iso))} selected={iso === selected} onPress={() => setChosen(iso)} />
                ))}
              </View>
            </>
          ) : null}

          {partner ? (
            <InfoCard
              title={t('mapSheet.discountTitle', { percent: partner.pawDiscountPercent })}
              body={
                balance !== null
                  ? t('mapSheet.discountBodyBalance', { cost: pawsLabel(partner.pointsCost), balance: pawsLabel(balance) })
                  : t('mapSheet.discountBody', { cost: pawsLabel(partner.pointsCost) })
              }
            />
          ) : null}

          <View style={styles.buttons}>
            <View style={styles.secondary}>
              <Button
                label={t('mapSheet.services')}
                variant="secondary"
                onPress={() => router.push({ pathname: '/services/[providerId]', params: { providerId: p.id } })}
              />
            </View>
            <View style={styles.primary}>
              <Button
                label={selected ? t('mapSheet.bookAt', { time: formatTimeIn(selected, timeZone) }) : t('mapSheet.book')}
                disabled={!service}
                onPress={() =>
                  service &&
                  router.push({ pathname: '/book', params: { providerId: p.id, serviceId: service.id, ...(selected ? { startsAt: selected } : {}) } })
                }
              />
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: Radius[32],
    borderTopRightRadius: Radius[32],
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3 },
  close: { position: 'absolute', top: Spacing.two, right: Spacing.two, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  head: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center', paddingRight: 40 },
  photo: { width: 72, height: 72, borderRadius: 18 },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  secondary: { flex: 2 },
  primary: { flex: 3 },
});
