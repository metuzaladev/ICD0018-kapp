import { legalAcceptanceCurrent, LEGAL_VERSIONS, type DeleteAccountInput, type Profile } from '@kapp/shared';

/**
 * Pure rules behind the M10 account screens (docs/17), kept out of the components so they can be
 * unit-tested without React Native.
 */

/** How deletion is confirmed: the password, or (Apple/Google accounts) a fresh sign-in. */
export type ReauthMode = 'password' | 'signIn';

export const reauthMode = (profile: Pick<Profile, 'hasPassword'>): ReauthMode => (profile.hasPassword ? 'password' : 'signIn');

/** The DELETE /me body: a password account sends the password, a social account `{}` (never null). */
export function deleteAccountBody(mode: ReauthMode, password: string): DeleteAccountInput {
  return mode === 'password' ? { password } : {};
}

/** The submit button is enabled once the chosen confirmation is possible (the alert confirms again). */
export function canRequestDeletion(mode: ReauthMode, password: string): boolean {
  return mode === 'signIn' || password.length > 0;
}

/**
 * After DELETE /me fails with these, the account is already gone (an earlier attempt succeeded but
 * its answer was lost, or another device deleted it): sign out locally like after a success.
 */
export const deletionMeansGone = (status: number) => status === 401 || status === 404;

/** The blocking consent sheet appears when the stored versions are not the current ones. */
export function needsLegalAcceptance(profile: Pick<Profile, 'legal'> | undefined): boolean {
  return profile ? !legalAcceptanceCurrent(profile.legal) : false;
}

/** First acceptance (social sign-up, accounts older than M10) or a changed text. */
export function legalConsentKind(profile: Pick<Profile, 'legal'>): 'new' | 'updated' {
  return profile.legal.termsVersion === null && profile.legal.privacyVersion === null ? 'new' : 'updated';
}

export const currentLegalVersions = () => ({ termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy });
