import type { Park } from '@kapp/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useActiveCheckIn } from '@/hooks/use-visits';
import { openDirections } from '@/lib/directions';
import { dogsLabel, formatKm } from '@/lib/format';
import { nearestParkAction } from '@/lib/home-activity';

/**
 * Figma "Lähim park" card (Home / Today and Explore / Map): photo, name, "0,4 km · 6 koera" and one
 * main action. Figma always says "Oleme siin", but from a kilometre away that is not true (product
 * owner feedback, M11), so the button follows the distance (lib/home-activity.ts):
 * - within 300 m → "Oleme siin" opens the existing check-in flow (M3);
 * - further → "Juhata kohale" opens walking directions; check-in stays on the park page;
 * - without the user's real position (Tallinn fallback) → "Vaata parki";
 * - already checked in there → "Oled siin" opens the park page (where "Lõpeta külastus" lives).
 *
 * Two VoiceOver elements: the card (opens the park page) and the button. The button is a sibling of
 * the card's pressable, not nested in it, so both stay reachable.
 */
export function NearestParkCard({
  park,
  usingFallback,
  floating = false,
  style,
}: {
  park: Park;
  /** True while the distance is measured from Tallinn's centre, not from the user. */
  usingFallback: boolean;
  floating?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const { t } = useTranslation();
  const active = useActiveCheckIn().data;
  const action = nearestParkAction({ checkedInHere: active?.park.id === park.id, distanceKm: park.distanceKm, usingFallback });
  const dogs = park.activeDogs ?? 0;
  const meta = [formatKm(park.distanceKm), dogs > 0 ? dogsLabel(dogs) : t('parkRow.quiet')].filter(Boolean).join(' · ');
  const openPark = () => router.push({ pathname: '/parks/[parkId]', params: { parkId: park.id } });
  const button = {
    here: { label: t('nearestPark.hereNow'), hint: t('parkRow.hint'), onPress: openPark },
    checkIn: {
      label: t('park.checkIn'),
      hint: t('nearestPark.checkInHint', { name: park.name }),
      onPress: () => router.push({ pathname: '/check-in', params: { parkId: park.id, parkName: park.name } }),
    },
    directions: { label: t('park.directions'), hint: t('nearestPark.directionsHint'), onPress: () => openDirections(park) },
    open: { label: t('nearestPark.open'), hint: t('parkRow.hint'), onPress: openPark },
  }[action];
  // Brand fill only for the action Figma highlights (check in); the others are secondary.
  const primary = action === 'checkIn';

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, floating && styles.floating, style]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${t('nearestPark.label')}: ${park.name}, ${meta}`}
        accessibilityHint={t('parkRow.hint')}
        onPress={openPark}
        style={styles.main}>
        {/* Parks have no photos in the API yet: the licensed placeholder (docs/05). */}
        <Image source={require('@/assets/images/park-placeholder.jpg')} style={styles.photo} contentFit="cover" accessible={false} />
        <View style={styles.text}>
          {/* Name first, then "Lähim park · 0,3 km · praegu vaikne": the park is what the eye looks for. */}
          <ThemedText type="heading">{park.name}</ThemedText>
          <ThemedText type="caption" themeColor="muted">
            {`${t('nearestPark.label')} · ${meta}`}
          </ThemedText>
        </View>
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={button.label}
        accessibilityHint={button.hint}
        onPress={button.onPress}
        style={[styles.button, { backgroundColor: primary ? c.brand : c.soft }]}>
        <ThemedText type="label" style={{ color: primary ? c.onBrand : c.text, textAlign: 'center' }}>
          {button.label}
        </ThemedText>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: Radius[16],
    borderWidth: 1,
  },
  floating: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  photo: { width: 62, height: 50, borderRadius: 10 },
  text: { flex: 1, gap: 1 },
  // Label sets the width (no fixed width: "Мы здесь" / "Проложить маршрут"), minHeight for the 44 pt target.
  button: { minHeight: 44, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 14, justifyContent: 'center', maxWidth: '45%' },
});
