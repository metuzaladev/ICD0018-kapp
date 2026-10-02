import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
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
      <Icon name="paw-print" size={18} color={c.brand} />
      <ThemedText type="label" style={{ color: c.accent }}>
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

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingLeft: Spacing.two,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
});
