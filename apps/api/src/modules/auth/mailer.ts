import type { FastifyBaseLogger } from 'fastify';

/**
 * Outgoing email. An interface so the auth module does not depend on a provider:
 * development logs the link, production plugs in Resend/Postmark without touching auth code.
 */
export interface Mailer {
  sendPasswordReset(message: { to: string; name: string; url: string }): Promise<void>;
}

/**
 * Development mailer: writes the reset link to the log instead of sending it.
 * The link is a credential, so it is only logged outside production.
 */
export function createLogMailer(log: Pick<FastifyBaseLogger, 'info' | 'error'>, isProduction: boolean): Mailer {
  return {
    async sendPasswordReset({ to, url }) {
      if (isProduction) {
        log.error({ to }, 'password reset requested but no email provider is configured');
        return;
      }
      log.info({ to, url }, 'password reset link (dev mailer — not sent)');
    },
  };
}
