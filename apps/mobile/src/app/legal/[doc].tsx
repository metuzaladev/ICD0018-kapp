import { isLegalDocument, legalBlocks } from '@kapp/shared';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/empty-state';
import { LegalDocumentView } from '@/components/legal-document';
import { Screen } from '@/components/screen';
import { currentLanguage } from '@/i18n';

/**
 * Privacy policy or terms of use (M10, docs/17), in the app's language. Reachable signed out (sign-up
 * links, Welcome footer) and signed in (Settings → Privaatsus ja tingimused, the consent sheet), so
 * the route sits outside both protected groups in the root layout.
 */
export default function LegalDocumentScreen() {
  // useTranslation re-renders the screen on a language change; parsing a few KB is cheap.
  const { t } = useTranslation();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const blocks = isLegalDocument(doc) ? legalBlocks(doc, currentLanguage()) : null;

  return (
    <Screen underHeader>
      {blocks ? <LegalDocumentView blocks={blocks} /> : <EmptyState title={t('errors.generic')} />}
    </Screen>
  );
}
