import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The paw-discount pill of Pood rows and Product Cards (Figma "Discount": paw + "−15%"). The
 * percentage comes from the server. Decorative: the row's label reads "−15% käppadega".
 */
export function DiscountPill({ percent }: { percent: number }) {
  const c = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.pill, { backgroundColor: c.soft }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icon name="paw-print" size={12} color={c.brand} />
      <ThemedText type="caption" style={{ color: c.accent }}>
        {t('shop.discount', { percent })}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full },
});
