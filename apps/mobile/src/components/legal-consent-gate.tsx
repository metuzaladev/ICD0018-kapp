import { legalBlocks, type LegalDocument } from '@kapp/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { LegalDocumentView } from '@/components/legal-document';
import { ListRow } from '@/components/list-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAcceptLegal, useMe } from '@/hooks/use-account';
import { currentLanguage } from '@/i18n';
import { legalConsentKind, needsLegalAcceptance } from '@/lib/account';
import { errorMessage } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { haptic } from '@/lib/haptics';

/**
 * Blocking sheet while the signed-in user has not accepted the current terms and privacy policy
 * (M10, docs/17): social sign-ups (nothing accepted yet), accounts older than M10, and everyone after
 * a version bump. It cannot be swiped away — the choices are "Nõustun" or "Logi välja" — and the
 * documents open inside it, because a navigation push would land behind the modal.
 */
export function LegalConsentGate() {
  const { t } = useTranslation();
  const me = useMe();
  const accept = useAcceptLegal();
  const [reading, setReading] = useState<LegalDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Insets from the app's provider: a SafeAreaView inside a Modal measures the modal's own window and
  // got zero, so the title sat under the status bar and the notch.
  const insets = useSafeAreaInsets();
  const profile = me.data;
  if (!profile || !needsLegalAcceptance(profile)) return null;
  const kind = legalConsentKind(profile);

  async function agree() {
    setError(null);
    try {
      await accept.mutateAsync();
      haptic('success');
    } catch (e) {
      haptic('error');
      setError(errorMessage(e));
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setReading(null)}>
      <ThemedView style={styles.root}>
        <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <ScrollView contentContainerStyle={styles.content}>
            {reading ? (
              <>
                <Button label={t('legal.back')} variant="tertiary" onPress={() => setReading(null)} />
                <LegalDocumentView blocks={legalBlocks(reading, currentLanguage())} />
                <Button label={t('legal.back')} variant="secondary" onPress={() => setReading(null)} />
              </>
            ) : (
              <>
                <ThemedText type="title" accessibilityRole="header">
                  {t(kind === 'new' ? 'legal.consentTitleNew' : 'legal.consentTitleUpdated')}
                </ThemedText>
                <ThemedText themeColor="muted">{t(kind === 'new' ? 'legal.consentBodyNew' : 'legal.consentBodyUpdated')}</ThemedText>
                <ListRow icon="info" title={t('legal.terms')} accessibilityHint={t('legal.openHint')} onPress={() => setReading('terms')} />
                <ListRow icon="shield" title={t('legal.privacy')} accessibilityHint={t('legal.openHint')} onPress={() => setReading('privacy')} />
                <FormError message={error} />
                <View style={styles.actions}>
                  <Button label={t('legal.accept')} loading={accept.isPending} onPress={agree} />
                  <Button label={t('legal.signOut')} variant="tertiary" onPress={() => void authClient.signOut()} />
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: Spacing.screen, gap: Spacing.three },
  actions: { gap: Spacing.two, marginTop: Spacing.two },
});
