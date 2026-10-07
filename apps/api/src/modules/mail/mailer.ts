import type { Language } from '@kapp/shared';

import { withTimeout } from '../../lib/timeout';
import { ENQUEUE_TIMEOUT_MS } from '../notifications/notifier';
import { mailJobId, type MailQueue } from './mail-queue';

/**
 * Outgoing email as the rest of the API sees it (auth, account deletion). An interface so modules do
 * not depend on the queue or a provider; tests pass a recording fake.
 *
 * Never throws: the action that triggers an email (sign-up, reset request, deletion) has already
 * happened, and for a reset request an error would even reveal that the address has an account.
 * A failure to queue is logged without the address (docs/15) and alerted on.
 */
export interface Mailer {
  sendPasswordReset(message: AccountEmail & { url: string; token: string }): Promise<void>;
  sendEmailVerification(message: AccountEmail & { url: string; token: string }): Promise<void>;
  sendAccountDeleted(message: AccountEmail): Promise<void>;
}

export interface AccountEmail {
  userId: string;
  to: string;
  name: string;
  language: Language;
}

export function createQueuedMailer({ queue, log, privacyUrl }: { queue: Pick<MailQueue, 'enqueue'>; log: { error(obj: object, msg: string): void }; privacyUrl: string }): Mailer {
  async function enqueue(...args: Parameters<MailQueue['enqueue']>) {
    try {
      // Redis being slow must not hold the request (same budget as the push notifier).
      await withTimeout(queue.enqueue(...args), ENQUEUE_TIMEOUT_MS, 'mail.enqueue');
    } catch (err) {
      log.error({ err, template: args[0].template }, 'could not queue email');
    }
  }
  const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

  return {
    sendPasswordReset: ({ userId, to, name, language, url, token }) =>
      enqueue({ template: 'password-reset', to, language, params: { name: firstName(name), url } }, mailJobId('password-reset', userId, token)),
    sendEmailVerification: ({ userId, to, name, language, url, token }) =>
      enqueue({ template: 'verify-email', to, language, params: { name: firstName(name), url } }, mailJobId('verify-email', userId, token)),
    // One confirmation per deleted account: the user id is the token.
    sendAccountDeleted: ({ userId, to, name, language }) =>
      enqueue({ template: 'account-deleted', to, language, params: { name: firstName(name), privacyUrl } }, mailJobId('account-deleted', userId, userId)),
  };
}

/** For tests and scripts that never send email. */
export const noMailer: Mailer = { sendPasswordReset: async () => {}, sendEmailVerification: async () => {}, sendAccountDeleted: async () => {} };
