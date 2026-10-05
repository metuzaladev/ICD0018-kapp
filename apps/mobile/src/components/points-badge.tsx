import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { usePointsBalance } from '@/hooks/use-points';
import { useTheme } from '@/hooks/use-theme';
import { formatNumber } from '@/lib/format';

/**
 * Figma "Points Badge" (56:113): soft brand pill with a paw and the Käpad balance in the accent ink.
 * Renders nothing while there is no balance (until M9b, always — see hooks/use-points.ts).
 * Read as one element: "320 käppa".
 */
export function PointsBadge() {
  const c = useTheme();
  const { t } = useTranslation();
  const points = usePointsBalance();
  if (points === null) return null;
  return (
    <View
      accessible
      accessibilityLabel={t('points.balance', { count: points })}
      style={[styles.badge, { backgroundColor: c.soft }]}>
      <Icon name="paw-print" size={18} color={c.brand} />
      <ThemedText type="label" style={{ color: c.accent }}>
        {formatNumber(points)}
      </ThemedText>
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
