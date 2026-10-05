import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/icon-button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sessionNotice, useSessionNotice } from '@/lib/session-notice';

/**
 * The "toast" after a deliberate sign-out (M10: account deleted), shown on Welcome. It stays until
 * dismissed (a timed toast can vanish before a VoiceOver user hears it) and is announced once.
 */
export function SessionNoticeBanner() {
  const { t } = useTranslation();
  const c = useTheme();
  const notice = useSessionNotice();
  const text = notice === 'account-deleted' ? t('account.deletedNotice') : null;

  useEffect(() => {
    if (text) AccessibilityInfo.announceForAccessibility(text);
  }, [text]);

  if (!text) return null;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLiveRegion="polite">
      <Icon name="check" size={24} color={c.brand} />
      <ThemedText type="label" style={styles.text}>
        {text}
      </ThemedText>
      <IconButton icon="x" accessibilityLabel={t('common.close')} onPress={() => sessionNotice.clear()} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius[16], borderWidth: StyleSheet.hairlineWidth },
  text: { flex: 1 },
});
