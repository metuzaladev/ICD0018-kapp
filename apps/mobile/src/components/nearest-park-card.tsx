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
import { dogsLabel, formatKm } from '@/lib/format';

/**
 * Figma "Lähim park" card (Home / Today and Explore / Map): photo, name, "0,4 km · 6 koera" and
 * "Oleme siin", which opens the existing check-in flow (M3). When the user is already checked in
 * there, the button opens the park page instead (where "Lõpeta külastus" lives).
 *
 * Two VoiceOver elements: the card (opens the park page) and the button. The button is a sibling of
 * the card's pressable, not nested in it, so both stay reachable.
 */
export function NearestParkCard({ park, floating = false, style }: { park: Park; floating?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  const { t } = useTranslation();
  const active = useActiveCheckIn().data;
  const here = active?.park.id === park.id;
  const dogs = park.activeDogs ?? 0;
  const meta = [formatKm(park.distanceKm), dogs > 0 ? dogsLabel(dogs) : t('parkRow.quiet')].filter(Boolean).join(' · ');
  const openPark = () => router.push({ pathname: '/parks/[parkId]', params: { parkId: park.id } });

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
          <ThemedText type="micro" themeColor="muted">
            {t('nearestPark.label')}
          </ThemedText>
          <ThemedText type="heading">{park.name}</ThemedText>
          <ThemedText type="caption" themeColor="muted">
            {meta}
          </ThemedText>
        </View>
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={here ? t('nearestPark.hereNow') : t('park.checkIn')}
        accessibilityHint={here ? t('parkRow.hint') : t('nearestPark.checkInHint', { name: park.name })}
        onPress={() => (here ? openPark() : router.push({ pathname: '/check-in', params: { parkId: park.id, parkName: park.name } }))}
        style={[styles.button, { backgroundColor: here ? c.soft : c.brand }]}>
        <ThemedText type="label" style={{ color: here ? c.text : c.onBrand, textAlign: 'center' }}>
          {here ? t('nearestPark.hereNow') : t('park.checkIn')}
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
  // Label sets the width (no fixed width: "Мы здесь" / "We're here"), minHeight for the 44 pt target.
  button: { minHeight: 44, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 14, justifyContent: 'center', maxWidth: '45%' },
});
