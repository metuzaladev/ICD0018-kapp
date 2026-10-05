import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { usePointsBalance } from '@/hooks/use-points';
import { useTheme } from '@/hooks/use-theme';
import { formatNumber } from '@/lib/format';

/**
 * Figma "Points Badge" (56:113): soft brand pill with a paw and the Käpad balance in the accent ink.
 * The balance comes from GET /me/rewards (hooks/use-points.ts); while it is unknown the badge
 * renders nothing, so no invented number is ever shown. Read as one element: "320 käppa"; with
 * `onPress` (Home, map search) it is a button that opens Käpad.
 */
export function PointsBadge({ onPress }: { onPress?: () => void }) {
  const c = useTheme();
  const { t } = useTranslation();
  const points = usePointsBalance();
  if (points === null) return null;
  const content = (
    <>
      <Icon name="paw-print" size={16} color={c.brand} />
      <ThemedText type="label" style={[styles.number, { color: c.accent }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {formatNumber(points)}
      </ThemedText>
    </>
  );
  if (onPress) {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('points.balance', { count: points })}
        accessibilityHint={t('points.openHint')}
        onPress={onPress}
        hitSlop={8}
        style={[styles.badge, { backgroundColor: c.soft }]}>
        {content}
      </PressableScale>
    );
  }
  return (
    <View accessible accessibilityLabel={t('points.balance', { count: points })} style={[styles.badge, { backgroundColor: c.soft }]}>
      {content}
    </View>
  );
}

/**
 * M11: the pill sat high in the map search field because it aligned itself to the top
 * (`alignSelf: 'flex-start'`) and its 6 + 20 + 6 pt height did not match the field. Now it is a
 * 32 pt pill (minHeight, so Dynamic Type can still grow it) centred by its parent row, with the
 * paw and the number centred inside — 10 pt from the field edge on every side in the 52 pt search.
 * The 8 pt hitSlop keeps the touch target at 48 pt.
 */
const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 32,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: Radius.full,
  },
  // No extra leading above/below the digits, so they sit on the paw's centre line.
  number: { includeFontPadding: false, textAlignVertical: 'center' },
});
