import type { AccountExport, DeleteAccountInput, LegalAcceptance, Profile } from '@kapp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/lib/api';
import { currentLegalVersions } from '@/lib/account';

import { ownProfileKey } from './use-safety';

/**
 * M10 account hooks (docs/17): legal acceptance, confirmation resend, data export and deletion.
 * The profile itself (with `legal`, `emailVerified`, `hasPassword`) is `useOwnProfile` (use-safety.ts),
 * so the consent gate, the "Kinnita e-post" banner and the settings share one cached GET /me.
 */
export { useOwnProfile as useMe } from './use-safety';

export function useAcceptLegal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<LegalAcceptance>('PUT', '/me/legal-acceptance', currentLegalVersions()),
    onSuccess: (legal) => client.setQueryData<Profile>(ownProfileKey, (me) => (me ? { ...me, legal } : me)),
  });
}

export function useResendVerification() {
  return useMutation({ mutationFn: () => apiSend<void>('POST', '/me/email-verification') });
}

/** Fetched on demand (not cached): the export can be large and must always be fresh. */
export function useExportData() {
  return useMutation({ mutationFn: () => apiGet<AccountExport>('/me/export') });
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: (body: DeleteAccountInput) => apiSend<void>('DELETE', '/me', body) });
}
