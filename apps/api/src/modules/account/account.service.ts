import { LEGAL_VERSIONS, REAUTH_WINDOW_MINUTES, type AccountExport, type DeleteAccountInput, type LegalAcceptance, type LegalAcceptanceInput } from '@kapp/shared';

import { ConflictError, ForbiddenError, NotFoundError } from '../../http/errors';
import { withTimeout } from '../../lib/timeout';
import type { BookingReminders } from '../bookings/booking-reminders';
import type { Mailer } from '../mail/mailer';
import { ENQUEUE_TIMEOUT_MS } from '../notifications/notifier';
import type { AccountRepository } from './account.repository';
import type { StorageCleanup } from './storage-cleanup';

/**
 * The account itself (M10, docs/17-konto-privaatsus-e-post.md): deletion (GDPR art. 17, App Store
 * 5.1.1(v), Google Play), data export (art. 15/20), legal acceptance and the email confirmation resend.
 */
export interface AccountService {
  deleteAccount(userId: string, input: DeleteAccountInput & { sessionCreatedAt: Date }): Promise<void>;
  acceptLegal(userId: string, input: LegalAcceptanceInput): Promise<LegalAcceptance>;
  exportData(userId: string): Promise<AccountExport>;
  resendVerification(userId: string, request: AuthRequest): Promise<void>;
}

/** The incoming request's headers, passed through untouched to Better Auth (session cookie). */
export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
}

/** What account needs from Better Auth (modules/auth/account-auth.ts); a fake in tests. */
export interface AccountAuth {
  /** False when the user has no password login or the password does not match. */
  verifyPassword(userId: string, password: string): Promise<boolean>;
  /** Sends a new confirmation email for the signed-in user; 'already-verified' when there is nothing to do. */
  sendVerificationEmail(request: AuthRequest, email: string): Promise<'sent' | 'already-verified'>;
}

export interface AccountLog {
  info(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export const REAUTH_WINDOW_MS = REAUTH_WINDOW_MINUTES * 60_000;

export function createAccountService({
  repository,
  auth,
  storageCleanup,
  reminders,
  mailer,
  log,
  timeoutMs,
  now = () => Date.now(),
}: {
  repository: AccountRepository;
  auth: AccountAuth;
  storageCleanup: StorageCleanup;
  reminders: Pick<BookingReminders, 'cancel'>;
  mailer: Pick<Mailer, 'sendAccountDeleted'>;
  log: AccountLog;
  timeoutMs: number;
  now?: () => number;
}): AccountService {
  const t = <T>(p: Promise<T>, label: string, ms = timeoutMs) => withTimeout(p, ms, label);

  /**
   * Re-authentication before anything irreversible: a stolen unlocked phone or a leaked session
   * cookie must not be enough. Password accounts confirm the password; Apple/Google accounts have no
   * password here, so they must have signed in within the last REAUTH_WINDOW_MINUTES.
   */
  async function reauthenticate(userId: string, hasPassword: boolean, password: string | undefined, sessionCreatedAt: Date) {
    if (hasPassword) {
      if (!password) throw new ForbiddenError('errors.reauthPasswordRequired');
      if (!(await t(auth.verifyPassword(userId, password), 'account.verifyPassword'))) throw new ForbiddenError('errors.reauthPasswordWrong');
      return 'password' as const;
    }
    if (now() - sessionCreatedAt.getTime() > REAUTH_WINDOW_MS) throw new ForbiddenError('errors.reauthRequired');
    return 'recent-sign-in' as const;
  }

  return {
    async deleteAccount(userId, { password, sessionCreatedAt }) {
      const owner = await t(repository.findOwner(userId), 'account.findOwner');
      if (!owner) throw new NotFoundError('errors.userNotFound');
      const method = await reauthenticate(userId, owner.hasPassword, password, sessionCreatedAt);

      const deleted = await t(repository.deleteAccount(userId), 'account.delete');
      // Someone else (another device) deleted it between the two calls: the same answer as a retry.
      if (!deleted) throw new NotFoundError('errors.userNotFound');

      // Everything below runs after the commit and never fails the request: the account is gone.
      const objects = deleted.storageKeys.length;
      try {
        await t(storageCleanup.enqueue({ userId, keys: deleted.storageKeys, prefixes: deleted.storagePrefixes }), 'account.storageCleanup', ENQUEUE_TIMEOUT_MS);
      } catch (err) {
        // Orphaned private objects only cost space; the ids let an operator re-run the cleanup.
        log.error({ err, userId, objects, prefixes: deleted.storagePrefixes.length }, 'account storage cleanup could not be queued');
      }
      await Promise.all(
        deleted.cancelledBookingIds.map((bookingId) =>
          t(reminders.cancel(bookingId), 'account.cancelReminder', ENQUEUE_TIMEOUT_MS).catch((err: unknown) => log.error({ err, bookingId }, 'booking reminder could not be removed')),
        ),
      );
      await mailer.sendAccountDeleted({ userId, to: owner.email, name: owner.name, language: owner.language });
      // Audit line: ids and counts only — no name, no email (docs/15).
      log.info({ event: 'account_deleted', userId, method, objects, bookingsCancelled: deleted.cancelledBookingIds.length }, 'account deleted');
    },

    async acceptLegal(userId, input) {
      // Only the versions the server publishes right now: an old app build that shows stale texts
      // cannot record consent to them.
      if (input.termsVersion !== LEGAL_VERSIONS.terms || input.privacyVersion !== LEGAL_VERSIONS.privacy) {
        throw new ConflictError('errors.legalVersionOutdated');
      }
      const accepted = await t(repository.acceptLegal(userId, input), 'account.acceptLegal');
      if (!accepted) throw new NotFoundError('errors.userNotFound');
      return accepted;
    },

    async exportData(userId) {
      const sections = await t(repository.exportData(userId), 'account.export');
      if (!sections) throw new NotFoundError('errors.userNotFound');
      return { exportedAt: new Date(now()).toISOString(), format: 'kapp-export/1', sections };
    },

    async resendVerification(userId, request) {
      const owner = await t(repository.findOwner(userId), 'account.findOwner');
      if (!owner) throw new NotFoundError('errors.userNotFound');
      if (owner.emailVerified) throw new ConflictError('errors.emailAlreadyVerified');
      const result = await t(auth.sendVerificationEmail(request, owner.email), 'account.sendVerificationEmail');
      if (result === 'already-verified') throw new ConflictError('errors.emailAlreadyVerified');
    },
  };
}
