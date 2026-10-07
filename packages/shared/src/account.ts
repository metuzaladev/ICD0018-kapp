import { z } from 'zod';

import { LANGUAGES } from './i18n';
import { PASSWORD_MAX } from './schemas';
import { issueMessage } from './validation';

/**
 * M10 account contracts: deletion, legal acceptance, data export (docs/17-konto-privaatsus-e-post.md).
 */

/**
 * DELETE /api/v1/me. Email accounts confirm with their current password; accounts without a
 * password (Apple/Google only) send `{}` and must have signed in within REAUTH_WINDOW_MINUTES.
 */
export const deleteAccountInputSchema = z
  .object({
    password: z.string().min(1, issueMessage('validation.passwordRequired')).max(PASSWORD_MAX, issueMessage('validation.maxChars', { max: PASSWORD_MAX })).optional(),
  })
  .strict();
export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>;

/**
 * How recent a sign-in must be for a password-less account to be deleted. Long enough to sign in
 * again and tap "delete", short enough that a phone left unlocked hours ago cannot be used.
 */
export const REAUTH_WINDOW_MINUTES = 10;

/** PUT /api/v1/me/legal-acceptance: the versions the user saw (must be the current ones). */
export const legalAcceptanceInputSchema = z
  .object({
    termsVersion: z.string().trim().min(1).max(40),
    privacyVersion: z.string().trim().min(1).max(40),
  })
  .strict();
export type LegalAcceptanceInput = z.infer<typeof legalAcceptanceInputSchema>;

export const legalAcceptanceSchema = z.object({
  termsVersion: z.string().nullable(),
  privacyVersion: z.string().nullable(),
  acceptedAt: z.string().nullable(),
});
export type LegalAcceptance = z.infer<typeof legalAcceptanceSchema>;

/**
 * GET /api/v1/me/export (GDPR art. 15 and 20): everything stored about the user, as plain JSON
 * sections. Kept loosely typed: the export is for people and other services, not for the app's UI.
 */
export const accountExportSchema = z.object({
  exportedAt: z.string(),
  format: z.literal('kapp-export/1'),
  sections: z.record(z.string(), z.unknown()),
});
export type AccountExport = z.infer<typeof accountExportSchema>;

/** GET /legal/privacy, /legal/terms, /email-verified (public HTML pages): `?lang=` beats Accept-Language. */
export const legalPageQuerySchema = z.object({
  lang: z.enum(LANGUAGES).optional(),
  /** Better Auth appends `?error=INVALID_TOKEN` / `TOKEN_EXPIRED` when a confirmation link fails. */
  error: z.string().max(64).optional(),
});
export type LegalPageQuery = z.infer<typeof legalPageQuerySchema>;
