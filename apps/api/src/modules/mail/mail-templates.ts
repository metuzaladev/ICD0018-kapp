import { accents, translate, type Language, type MessageKey } from '@kapp/shared';

/**
 * Transactional emails (M10, docs/17): plain text + simple accessible HTML, in the recipient's
 * `user.language`. Texts are keys in packages/shared/src/i18n (`email.*`), so `npm run i18n:check`
 * keeps the three languages in step.
 *
 * HTML rules: one column, `lang` set, a real heading, the action as a link styled as a button with
 * the URL repeated as text (some clients block buttons, screen readers announce "link"), system
 * fonts, no remote images or tracking pixels (privacy, and images are blocked by default anyway).
 * Every interpolated value is HTML-escaped.
 */

export const MAIL_TEMPLATES = ['password-reset', 'verify-email', 'account-deleted'] as const;
export type MailTemplate = (typeof MAIL_TEMPLATES)[number];

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Parameters per template; all strings so they can travel in a queue job. */
export interface MailParams {
  name: string;
  /** password-reset, verify-email: the link to open. */
  url?: string;
  /** account-deleted: where the privacy policy (with the contact address) is published. */
  privacyUrl?: string;
}

const BRAND = accents.green.ink;
const INK = '#14181F';
const MUTED = '#4B5563';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

interface Layout {
  subject: MessageKey;
  paragraphs: MessageKey[];
  action?: { label: MessageKey; url: string };
  after?: MessageKey[];
}

function layout(template: MailTemplate, params: MailParams): Layout {
  switch (template) {
    case 'password-reset':
      return {
        subject: 'email.passwordReset.subject',
        paragraphs: ['email.passwordReset.intro'],
        action: { label: 'email.passwordReset.action', url: required(params.url, 'url') },
        after: ['email.passwordReset.expiry'],
      };
    case 'verify-email':
      return {
        subject: 'email.verify.subject',
        paragraphs: ['email.verify.intro'],
        action: { label: 'email.verify.action', url: required(params.url, 'url') },
        after: ['email.verify.expiry'],
      };
    case 'account-deleted':
      return { subject: 'email.deleted.subject', paragraphs: ['email.deleted.intro', 'email.deleted.details', 'email.deleted.notYou'] };
  }
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`email parameter ${name} is required`);
  return value;
}

export function renderEmail(template: MailTemplate, language: Language, params: MailParams): RenderedEmail {
  const l = layout(template, params);
  const tr = (key: MessageKey) => translate(language, key, { name: params.name, privacyUrl: params.privacyUrl ?? '' });
  const subject = tr(l.subject);
  const greeting = tr('email.greeting');
  const paragraphs = l.paragraphs.map(tr);
  const after = (l.after ?? []).map(tr);
  const footer = tr('email.footer');

  const text = [
    greeting,
    ...paragraphs,
    ...(l.action ? [`${tr(l.action.label)}: ${l.action.url}`] : []),
    ...after,
    '—',
    footer,
  ].join('\n\n');

  const p = (s: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:${INK}">${escapeHtml(s)}</p>`;
  const action = l.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(l.action.url)}" style="display:inline-block;background:${BRAND};color:#FFFFFF;text-decoration:none;font-weight:600;font-size:16px;padding:14px 24px;border-radius:12px">${escapeHtml(tr(l.action.label))}</a></p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:${MUTED}">${escapeHtml(tr('email.linkFallback'))}<br><a href="${escapeHtml(l.action.url)}" style="color:${BRAND};word-break:break-all">${escapeHtml(l.action.url)}</a></p>`
    : '';

  const html = `<!doctype html>
<html lang="${language}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F7F8FA">
<div role="article" aria-label="${escapeHtml(subject)}" lang="${language}" style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<p style="margin:0 0 24px;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:${BRAND}">käpp</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${INK}">${escapeHtml(subject)}</h1>
${p(greeting)}
${paragraphs.map(p).join('\n')}
${action}
${after.map(p).join('\n')}
<hr style="border:none;border-top:1px solid #E5E7EB;margin:32px 0 16px">
<p style="margin:0;font-size:13px;line-height:1.5;color:${MUTED}">${escapeHtml(footer)}</p>
</div>
</body>
</html>`;

  return { subject, text, html };
}
