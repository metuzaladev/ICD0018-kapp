import { UnrecoverableError } from 'bullmq';
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher, type Dispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMailProcessor, mailJobId, redactMailJob, type MailJob } from '../../src/modules/mail/mail-queue';
import { MAIL_TEMPLATES, renderEmail } from '../../src/modules/mail/mail-templates';
import {
  classifyResendStatus,
  classifySmtpError,
  createLogTransport,
  createMailTransportFromEnv,
  createResendTransport,
  createSmtpTransport,
  MailDeliveryError,
  type MailTransport,
  type OutgoingEmail,
} from '../../src/modules/mail/mail-transport';
import { createQueuedMailer } from '../../src/modules/mail/mailer';

const ADDRESS = 'mari.tamm@example.com';
const RESET_URL = 'https://api.kapp.example/api/v1/auth/reset-password/tok123?callbackURL=kapp%3A%2F%2Fnew-password';

const email = (overrides: Partial<OutgoingEmail> = {}): OutgoingEmail => ({
  from: 'Käpp <noreply@kapp.example>',
  to: ADDRESS,
  subject: 'Käpp: parooli taastamine',
  text: `Tere!\n\n${RESET_URL}`,
  html: '<p>Tere</p>',
  idempotencyKey: 'mail-password-reset-abc',
  ...overrides,
});

describe('renderEmail (M10 templates)', () => {
  const subjects = {
    'password-reset': { et: 'Käpp: parooli taastamine', en: 'Käpp: reset your password', ru: 'Käpp: восстановление пароля' },
    'verify-email': { et: 'Käpp: kinnita oma e-posti aadress', en: 'Käpp: confirm your email address', ru: 'Käpp: подтвердите адрес электронной почты' },
    'account-deleted': { et: 'Käpp: sinu konto on kustutatud', en: 'Käpp: your account has been deleted', ru: 'Käpp: ваш аккаунт удалён' },
  } as const;

  for (const template of MAIL_TEMPLATES) {
    for (const language of ['et', 'en', 'ru'] as const) {
      it(`${template} in ${language}: subject, greeting, lang attribute, plain text and HTML`, () => {
        const out = renderEmail(template, language, { name: 'Mari', url: RESET_URL, privacyUrl: 'https://api.kapp.example/legal/privacy' });
        expect(out.subject).toBe(subjects[template][language]);
        expect(out.html).toContain(`<html lang="${language}">`);
        expect(out.html).toContain(`<title>${out.subject}</title>`);
        expect(out.text).toContain('Mari');
        // No remote images, scripts or tracking: the HTML is self-contained.
        expect(out.html).not.toMatch(/<img|<script|<link|src=/i);
        if (template === 'account-deleted') {
          expect(out.text).toContain('https://api.kapp.example/legal/privacy');
        } else {
          expect(out.text).toContain(RESET_URL);
          // The link appears as a button and as copyable text, HTML-escaped (& → &amp;).
          expect(out.html.match(/href="https:\/\/api\.kapp\.example\/api\/v1\/auth\/reset-password\/tok123/g)).toHaveLength(2);
        }
      });
    }
  }

  it('escapes everything interpolated into HTML', () => {
    const out = renderEmail('verify-email', 'en', { name: '<script>alert(1)</script>', url: 'https://x.example/?a=1&b="2"' });
    expect(out.html).not.toContain('<script>alert');
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('a=1&amp;b=&quot;2&quot;');
  });

  it('refuses to render a link email without its link', () => {
    expect(() => renderEmail('password-reset', 'et', { name: 'Mari' })).toThrow(/url/);
  });
});

describe('log transport', () => {
  it('development: logs the subject and the link, never the address', async () => {
    const log = { info: vi.fn() };
    await createLogTransport(log, { isProduction: false }).send(email());
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ link: RESET_URL }), expect.any(String));
    expect(JSON.stringify(log.info.mock.calls)).not.toContain(ADDRESS);
  });

  it('production: neither the address nor the link (a credential)', async () => {
    const log = { info: vi.fn() };
    await createLogTransport(log, { isProduction: true }).send(email());
    expect(JSON.stringify(log.info.mock.calls)).not.toMatch(/mari\.tamm|tok123/);
  });
});

describe('Resend transport (undici MockAgent, no network)', () => {
  let agent: MockAgent;
  let previous: Dispatcher;
  beforeEach(() => {
    previous = getGlobalDispatcher();
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });
  afterEach(async () => {
    setGlobalDispatcher(previous);
    await agent.close();
  });

  it('posts the email with bearer auth and the idempotency key', async () => {
    let seen: { headers: Record<string, string>; body: unknown } | undefined;
    agent
      .get('https://api.resend.com')
      .intercept({ path: '/emails', method: 'POST' })
      .reply((req) => {
        seen = { headers: req.headers as Record<string, string>, body: JSON.parse(String(req.body)) };
        return { statusCode: 200, data: { id: 'em_1' } };
      });
    await createResendTransport({ apiKey: 're_test' }).send(email());
    expect(seen!.headers.authorization).toBe('Bearer re_test');
    expect(seen!.headers['idempotency-key']).toBe('mail-password-reset-abc');
    expect(seen!.body).toMatchObject({ to: [ADDRESS], subject: 'Käpp: parooli taastamine', from: 'Käpp <noreply@kapp.example>' });
  });

  it.each([
    [422, true],
    [400, true],
    [403, true],
    [429, false],
    [409, false],
    [500, false],
    [503, false],
  ])('status %i → permanent=%s, without the address in the error', async (status, permanent) => {
    agent.get('https://api.resend.com').intercept({ path: '/emails', method: 'POST' }).reply(status, { message: `rejected ${ADDRESS}` });
    const error = await createResendTransport({ apiKey: 're_test' }).send(email()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailDeliveryError);
    expect((error as MailDeliveryError).permanent).toBe(permanent);
    expect((error as Error).message).not.toContain(ADDRESS);
  });

  it('a network failure is transient', async () => {
    agent.get('https://api.resend.com').intercept({ path: '/emails', method: 'POST' }).replyWithError(new Error('ECONNRESET'));
    const error = await createResendTransport({ apiKey: 're_test' }).send(email()).catch((e: unknown) => e);
    expect(error).toMatchObject({ permanent: false });
  });

  it('classifyResendStatus', () => {
    expect(classifyResendStatus(401).permanent).toBe(true);
    expect(classifyResendStatus(502).permanent).toBe(false);
  });
});

describe('SMTP transport (nodemailer stream transport)', () => {
  it('hands a complete message to nodemailer (stream transport: no server, no network)', async () => {
    const transport = createSmtpTransport({ streamTransport: true, buffer: true, newline: 'unix' } as never);
    await expect(transport.send(email())).resolves.toBeUndefined();
  });

  it('wraps a refused connection as a sanitised transient error', async () => {
    // Port 9 on localhost: connection refused → a transient connection error, not the raw nodemailer error.
    const transport = createSmtpTransport({ host: '127.0.0.1', port: 9, connectionTimeout: 500, greetingTimeout: 500 } as never);
    const error = await transport.send(email()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailDeliveryError);
    expect((error as MailDeliveryError).permanent).toBe(false);
    expect((error as Error).message).not.toContain(ADDRESS);
  });

  it.each([
    [{ responseCode: 550, code: 'EENVELOPE', recipient: ADDRESS }, true],
    [{ responseCode: 553 }, true],
    [{ responseCode: 421 }, false],
    [{ responseCode: 451 }, false],
    [{ code: 'ECONNECTION' }, false],
    [{ code: 'ETIMEDOUT' }, false],
    [{ code: 'EAUTH' }, true],
    [{}, true],
  ])('classifies %o → permanent=%s without leaking the recipient', (error, permanent) => {
    const classified = classifySmtpError(error);
    expect(classified.permanent).toBe(permanent);
    expect(classified.message).not.toContain(ADDRESS);
  });
});

describe('createMailTransportFromEnv', () => {
  const log = { info: vi.fn() };
  it('picks the configured provider', () => {
    expect(createMailTransportFromEnv({ MAIL_PROVIDER: 'log', NODE_ENV: 'development' }, log).name).toBe('log');
    expect(createMailTransportFromEnv({ MAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x', NODE_ENV: 'production' }, log).name).toBe('resend');
    expect(createMailTransportFromEnv({ MAIL_PROVIDER: 'smtp', SMTP_URL: 'smtp://u:p@localhost:2525', NODE_ENV: 'production' }, log).name).toBe('smtp');
  });
});

describe('mail queue processor', () => {
  const job = (data: MailJob | ReturnType<typeof redactMailJob>) => ({
    id: 'mail-password-reset-123',
    name: data.template,
    data,
    attemptsMade: 0,
    updateData: vi.fn(async () => {}),
  });
  const data: MailJob = { template: 'password-reset', to: ADDRESS, language: 'en', params: { name: 'Mari', url: RESET_URL } };
  const transport = (send: MailTransport['send']): MailTransport => ({ name: 'log', send: vi.fn(send) });

  it('renders in the recipient language, sends with the job id as idempotency key, then removes the address and link', async () => {
    const t = transport(async () => {});
    const j = job(data);
    await createMailProcessor({ transport: t, from: 'Käpp <noreply@kapp.example>' })(j);
    expect(t.send).toHaveBeenCalledWith(expect.objectContaining({ to: ADDRESS, subject: 'Käpp: reset your password', idempotencyKey: 'mail-password-reset-123' }));
    expect(j.updateData).toHaveBeenCalledWith({ template: 'password-reset', redacted: true });
    expect(JSON.stringify(j.updateData.mock.calls)).not.toMatch(/mari|tok123/);
  });

  it('a permanent error fails the job without retries (UnrecoverableError) and redacts it', async () => {
    const j = job(data);
    const error = await createMailProcessor({ transport: transport(async () => Promise.reject(new MailDeliveryError('resend send failed (status=422)', true))), from: 'x' })(j).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(j.updateData).toHaveBeenCalledWith({ template: 'password-reset', redacted: true });
  });

  it('a transient error is thrown for BullMQ to retry; the job keeps its data for the retry', async () => {
    const j = job(data);
    const error = await createMailProcessor({ transport: transport(async () => Promise.reject(new MailDeliveryError('resend send failed (status=503)', false))), from: 'x' })(j).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(error).not.toBeInstanceOf(UnrecoverableError);
    expect(j.updateData).not.toHaveBeenCalled();
  });

  it('an unexpected error becomes a sanitised transient error (no raw message with an address in Redis)', async () => {
    const j = job(data);
    const error = await createMailProcessor({ transport: transport(async () => Promise.reject(new Error(`boom ${ADDRESS}`))), from: 'x' })(j).catch((e: unknown) => e);
    expect((error as Error).message).not.toContain(ADDRESS);
  });

  it('never sends from a redacted job (a retry after success or after giving up)', async () => {
    const t = transport(async () => {});
    await createMailProcessor({ transport: t, from: 'x' })(job(redactMailJob(data)));
    expect(t.send).not.toHaveBeenCalled();
  });
});

describe('mailJobId', () => {
  it('is deterministic per (template, user, token), differs otherwise, and hides the inputs', () => {
    const id = mailJobId('password-reset', 'user_1', 'tok');
    expect(mailJobId('password-reset', 'user_1', 'tok')).toBe(id);
    expect(mailJobId('password-reset', 'user_1', 'tok2')).not.toBe(id);
    expect(mailJobId('verify-email', 'user_1', 'tok')).not.toBe(id);
    expect(id).not.toMatch(/user_1|tok|:/);
  });
});

describe('createQueuedMailer', () => {
  const message = { userId: 'user_1', to: ADDRESS, name: 'Mari Tamm', language: 'ru' as const };

  it('queues each email with its template, first name, language and idempotent job id', async () => {
    const queue = { enqueue: vi.fn(async () => {}) };
    const mailer = createQueuedMailer({ queue, log: { error: vi.fn() }, privacyUrl: 'https://api.kapp.example/legal/privacy' });
    await mailer.sendPasswordReset({ ...message, url: RESET_URL, token: 'tok' });
    await mailer.sendEmailVerification({ ...message, url: 'https://api.kapp.example/verify', token: 'jwt' });
    await mailer.sendAccountDeleted(message);
    expect(queue.enqueue.mock.calls).toEqual([
      [{ template: 'password-reset', to: ADDRESS, language: 'ru', params: { name: 'Mari', url: RESET_URL } }, mailJobId('password-reset', 'user_1', 'tok')],
      [{ template: 'verify-email', to: ADDRESS, language: 'ru', params: { name: 'Mari', url: 'https://api.kapp.example/verify' } }, mailJobId('verify-email', 'user_1', 'jwt')],
      [{ template: 'account-deleted', to: ADDRESS, language: 'ru', params: { name: 'Mari', privacyUrl: 'https://api.kapp.example/legal/privacy' } }, mailJobId('account-deleted', 'user_1', 'user_1')],
    ]);
  });

  it('never throws: a Redis failure is logged without the address (a reset must not reveal accounts)', async () => {
    const log = { error: vi.fn() };
    const mailer = createQueuedMailer({ queue: { enqueue: vi.fn(async () => Promise.reject(new Error('redis down'))) }, log, privacyUrl: 'x' });
    await expect(mailer.sendPasswordReset({ ...message, url: RESET_URL, token: 'tok' })).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ template: 'password-reset' }), 'could not queue email');
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(ADDRESS);
  });

  it('a hanging Redis is cut off after the enqueue budget', async () => {
    vi.useFakeTimers();
    try {
      const log = { error: vi.fn() };
      const mailer = createQueuedMailer({ queue: { enqueue: () => new Promise<void>(() => {}) }, log, privacyUrl: 'x' });
      const pending = mailer.sendAccountDeleted(message);
      await vi.advanceTimersByTimeAsync(2500);
      await expect(pending).resolves.toBeUndefined();
      expect(log.error).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
