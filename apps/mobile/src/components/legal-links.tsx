import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';

/**
 * "Kasutustingimused · Privaatsuspoliitika" (M10, docs/17) under the sign-up form and on Welcome.
 * Separate buttons instead of links inside a sentence: word order differs between et/en/ru, and a
 * real button is easier to hit and to find with VoiceOver than a link inside running text.
 */
export function LegalLinks() {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <Button label={t('legal.terms')} variant="tertiary" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })} />
      </View>
      <View style={styles.cell}>
        <Button label={t('legal.privacy')} variant="tertiary" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  cell: { flexGrow: 1, flexBasis: 140 },
});
