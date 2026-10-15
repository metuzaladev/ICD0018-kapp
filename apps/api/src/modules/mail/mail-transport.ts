import { createTransport } from 'nodemailer';

/**
 * Where a rendered email actually goes (M10, docs/17). Chosen by MAIL_PROVIDER:
 *
 * - `log`    — development default: logs the template and, outside production, the link (so a reset
 *              can be tested locally). Never the recipient's address.
 * - `smtp`   — any SMTP server (nodemailer), e.g. an EU provider such as Brevo or Mailjet.
 * - `resend` — Resend's HTTP API (one fetch, native Idempotency-Key, EU sending region per domain).
 *
 * Every adapter throws MailDeliveryError with `permanent` set: permanent errors (rejected recipient,
 * bad credentials, invalid request) are not retried by the queue, transient ones (network, 429, 5xx,
 * SMTP 4xx) are. The error message never contains the address or the provider's raw response,
 * because BullMQ stores it in Redis and the worker logs it.
 */

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Stable per (template, user, token): providers that support it drop duplicates. */
  idempotencyKey: string;
}

export interface MailTransport {
  readonly name: 'log' | 'smtp' | 'resend';
  send(email: OutgoingEmail): Promise<void>;
}

export class MailDeliveryError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = 'MailDeliveryError';
  }
}

export interface MailLog {
  info(obj: object, msg: string): void;
}

/** First https link in the text — the only thing worth showing in a development log. */
const firstLink = (text: string) => /https?:\/\/\S+/.exec(text)?.[0];

export function createLogTransport(log: MailLog, { isProduction }: { isProduction: boolean }): MailTransport {
  return {
    name: 'log',
    async send(email) {
      // No address ever (personal data, docs/15). The link is a credential, so it only appears
      // outside production — production refuses MAIL_PROVIDER=log anyway (config/env.ts).
      log.info({ subject: email.subject, ...(isProduction ? {} : { link: firstLink(email.text) }) }, 'email (log transport — not sent)');
    },
  };
}

/* ---------------- SMTP (nodemailer) ---------------- */

/** nodemailer error codes that a retry can fix (connection problems); everything else is final. */
const SMTP_TRANSIENT_CODES = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ETLS', 'EPROXY', 'EMAXLIMIT', 'ECONNRESET', 'ECONNREFUSED']);

export function classifySmtpError(error: unknown): MailDeliveryError {
  const e = error as { code?: string; responseCode?: number };
  const status = typeof e.responseCode === 'number' ? e.responseCode : undefined;
  // SMTP reply codes: 4xx = try again later (greylisting, mailbox busy), 5xx = refused for good.
  const permanent = status !== undefined ? status >= 500 : !(e.code && SMTP_TRANSIENT_CODES.has(e.code));
  return new MailDeliveryError(`smtp send failed (code=${e.code ?? 'unknown'}, status=${status ?? 'none'})`, permanent);
}

/** Anything nodemailer accepts as a transport (an SMTP URL, or `{ streamTransport: true }` in tests). */
export type SmtpTransportOptions = Parameters<typeof createTransport>[0];

export function createSmtpTransport(options: SmtpTransportOptions): MailTransport {
  const transporter = createTransport(options as never);
  return {
    name: 'smtp',
    async send(email) {
      try {
        await transporter.sendMail({
          from: email.from,
          to: email.to,
          subject: email.subject,
          text: email.text,
          html: email.html,
          // Lets the receiving side and our own logs correlate retries of the same email.
          messageId: `<${email.idempotencyKey}@kapp.mail>`,
        });
      } catch (error) {
        throw classifySmtpError(error);
      }
    },
  };
}

/* ---------------- Resend (HTTP) ---------------- */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function classifyResendStatus(status: number): MailDeliveryError {
  // 409 = a concurrent request with the same Idempotency-Key is still running; 429 = rate limit.
  const permanent = status < 500 && status !== 429 && status !== 409;
  return new MailDeliveryError(`resend send failed (status=${status})`, permanent);
}

export function createResendTransport({ apiKey, fetchImpl = fetch, timeoutMs = 10_000 }: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number }): MailTransport {
  return {
    name: 'resend',
    async send(email) {
      let response: Response;
      try {
        response = await fetchImpl(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            // Resend keeps the key for 24 h: a retried job never sends the same email twice.
            'idempotency-key': email.idempotencyKey,
          },
          body: JSON.stringify({ from: email.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new MailDeliveryError('resend request failed (network or timeout)', false);
      }
      // The body is drained but never logged: error bodies can echo the recipient.
      await response.arrayBuffer().catch(() => undefined);
      if (!response.ok) throw classifyResendStatus(response.status);
    },
  };
}

/** The transport described by MAIL_PROVIDER (config/env.ts has already checked the credentials). */
export function createMailTransportFromEnv(
  env: { MAIL_PROVIDER: 'log' | 'smtp' | 'resend'; SMTP_URL?: string; RESEND_API_KEY?: string; NODE_ENV: string },
  log: MailLog,
): MailTransport {
  if (env.MAIL_PROVIDER === 'smtp') return createSmtpTransport(env.SMTP_URL!);
  if (env.MAIL_PROVIDER === 'resend') return createResendTransport({ apiKey: env.RESEND_API_KEY! });
  return createLogTransport(log, { isProduction: env.NODE_ENV === 'production' });
}

/** Development sender when MAIL_FROM is not set (production requires it). */
export const DEV_MAIL_FROM = 'Käpp <noreply@localhost>';
