import { LEGAL_VERSIONS } from '@kapp/shared';
import { describe, expect, it, vi } from 'vitest';

import { canRequestDeletion, currentLegalVersions, deleteAccountBody, deletionMeansGone, legalConsentKind, needsLegalAcceptance, reauthMode } from '@/lib/account';
import { sessionNotice } from '@/lib/session-notice';

const current = { termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy, acceptedAt: '2026-10-05T10:00:00.000Z' };

describe('account deletion rules (M10)', () => {
  it('email accounts confirm with the password, Apple/Google accounts by signing in again', () => {
    expect(reauthMode({ hasPassword: true })).toBe('password');
    expect(reauthMode({ hasPassword: false })).toBe('signIn');
  });

  it('builds the DELETE /me body: the password, or {} — never null or an empty password', () => {
    expect(deleteAccountBody('password', 'pikk-parool-123')).toEqual({ password: 'pikk-parool-123' });
    expect(deleteAccountBody('signIn', 'leftover')).toEqual({});
  });

  it('the submit button needs a password in password mode only', () => {
    expect(canRequestDeletion('password', '')).toBe(false);
    expect(canRequestDeletion('password', 'x')).toBe(true);
    expect(canRequestDeletion('signIn', '')).toBe(true);
  });

  it('401/404 after a delete attempt mean the account is already gone (sign out locally)', () => {
    expect(deletionMeansGone(401)).toBe(true);
    expect(deletionMeansGone(404)).toBe(true);
    expect(deletionMeansGone(403)).toBe(false);
    expect(deletionMeansGone(503)).toBe(false);
    expect(deletionMeansGone(0)).toBe(false);
  });
});

describe('legal consent gate', () => {
  it('asks when nothing was accepted or a version changed; not while the profile is loading', () => {
    expect(needsLegalAcceptance(undefined)).toBe(false);
    expect(needsLegalAcceptance({ legal: current })).toBe(false);
    expect(needsLegalAcceptance({ legal: { termsVersion: null, privacyVersion: null, acceptedAt: null } })).toBe(true);
    expect(needsLegalAcceptance({ legal: { ...current, privacyVersion: '2020-01-01' } })).toBe(true);
  });

  it('tells a first acceptance from an update (different wording)', () => {
    expect(legalConsentKind({ legal: { termsVersion: null, privacyVersion: null, acceptedAt: null } })).toBe('new');
    expect(legalConsentKind({ legal: { ...current, termsVersion: '2020-01-01' } })).toBe('updated');
  });

  it('accepts exactly the versions the app shows', () => {
    expect(currentLegalVersions()).toEqual({ termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy });
  });
});

describe('session notice ("Sinu konto on kustutatud" on Welcome)', () => {
  it('holds one notice until cleared and notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = sessionNotice.subscribe(listener);
    sessionNotice.set('account-deleted');
    expect(sessionNotice.get()).toBe('account-deleted');
    sessionNotice.clear();
    expect(sessionNotice.get()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    sessionNotice.set('account-deleted');
    expect(listener).toHaveBeenCalledTimes(2);
    sessionNotice.clear();
  });
});
