import type { Language } from '../i18n';
import { LEGAL_MARKDOWN } from './content.generated';
import { parseLegalMarkdown, type LegalBlock } from './markdown';

export { inlineText, parseInline, parseLegalMarkdown, type LegalBlock, type LegalInline } from './markdown';

/**
 * Privacy policy and terms of use (M10, docs/17-konto-privaatsus-e-post.md).
 *
 * The source of truth is the Markdown in this folder (`{privacy,terms}.{et,en,ru}.md`, Estonian is
 * the original). `npm run legal:build` copies it into content.generated.ts so both the API bundle
 * (esbuild) and the app (Metro) can import it without file-system access or a Markdown loader; a
 * test fails when the generated file is stale.
 *
 * Bump a version whenever the meaning of a text changes: users who accepted an older version are
 * asked again (the app's blocking sheet, `PUT /me/legal-acceptance`). Typo fixes keep the version.
 */
export const LEGAL_DOCUMENTS = ['privacy', 'terms'] as const;
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

export const LEGAL_VERSIONS: Record<LegalDocument, string> = {
  privacy: '2026-10-05',
  terms: '2026-10-05',
};

/** Must be replaced with the real controller before the store release (docs/17). */
export const LEGAL_CONTROLLER_PLACEHOLDER = '[Vastutav töötleja: nimi, registrikood, e-post]';

export function isLegalDocument(value: unknown): value is LegalDocument {
  return typeof value === 'string' && (LEGAL_DOCUMENTS as readonly string[]).includes(value);
}

export function legalMarkdown(document: LegalDocument, language: Language): string {
  return LEGAL_MARKDOWN[document][language];
}

export function legalBlocks(document: LegalDocument, language: Language): LegalBlock[] {
  return parseLegalMarkdown(legalMarkdown(document, language));
}

/** True when a published text still contains the controller placeholder (startup warning in the API). */
export function legalHasPlaceholders(): boolean {
  return LEGAL_DOCUMENTS.some((d) => Object.values(LEGAL_MARKDOWN[d]).some((md) => md.includes(LEGAL_CONTROLLER_PLACEHOLDER)));
}

/** Has the user accepted the current versions? Null columns (never accepted) count as outdated. */
export function legalAcceptanceCurrent(accepted: { termsVersion: string | null; privacyVersion: string | null }): boolean {
  return accepted.termsVersion === LEGAL_VERSIONS.terms && accepted.privacyVersion === LEGAL_VERSIONS.privacy;
}
