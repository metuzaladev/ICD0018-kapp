/**
 * M10 email pipeline with real Better Auth, PostgreSQL and the BullMQ queue in Redis
 * (docs/17-konto-privaatsus-e-post.md): sign-up queues one confirmation, a reset request queues one
 * reset email, the worker renders them in the user's language through a recording transport (no
 * real email is sent), and afterwards the jobs no longer hold the address or the link.
 */
import { like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { env } from '../../src/config/env';
import { db, pool } from '../../src/db/client';
import { user } from '../../src/db/schema';
import { createMailProcessor, createMailQueue, startMailWorker, type MailJob, type RedactedMailJob } from '../../src/modules/mail/mail-queue';
import type { MailTransport, OutgoingEmail } from '../../src/modules/mail/mail-transport';
import { createQueuedMailer } from '../../src/modules/mail/mailer';
import { buildRealApp } from './real-app';

const DOMAIN = '@mail-flow.test.invalid';
const RUN = Date.now();
const EMAIL = `mari-${RUN}${DOMAIN}`;
const connection = { url: env.REDIS_URL, prefix: `kapp-test-m10-${RUN}` };
const queue = createMailQueue(connection);
const silent = { warn: () => {}, error: () => {} };
const mailer = createQueuedMailer({ queue, log: silent, privacyUrl: 'http://localhost:3000/legal/privacy' });
let app: Awaited<ReturnType<typeof buildRealApp>>;

beforeAll(async () => {
  app = await buildRealApp(mailer);
});

afterAll(async () => {
  await app.close();
  await queue.queue.obliterate({ force: true });
  await queue.close();
  await db.delete(user).where(like(user.email, `%${DOMAIN}`));
  await pool.end();
});

describe('email through the queue', () => {
  it('sign-up queues exactly one confirmation email, a reset request exactly one reset email', async () => {
    const signUp = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-up/email',
      headers: { 'expo-origin': 'kapp://' },
      payload: { name: 'Mari Tamm', email: EMAIL, password: 'pikk-parool-123', language: 'en' },
    });
    expect(signUp.statusCode).toBe(200);
    const reset = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/request-password-reset',
      headers: { 'expo-origin': 'kapp://' },
      payload: { email: EMAIL, redirectTo: 'kapp://new-password' },
    });
    expect(reset.statusCode).toBe(200);
    // Unknown address: same answer, no job (no account enumeration, nothing to send).
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/request-password-reset',
      headers: { 'expo-origin': 'kapp://' },
      payload: { email: `nobody-${RUN}${DOMAIN}`, redirectTo: 'kapp://new-password' },
    });
    expect(unknown.statusCode).toBe(200);

    const jobs = await queue.queue.getJobs(['waiting', 'delayed', 'active']);
    expect(jobs.map((j) => j.name).sort()).toEqual(['password-reset', 'verify-email']);
    const resetJob = jobs.find((j) => j.name === 'password-reset')!;
    expect(resetJob.data).toMatchObject({ template: 'password-reset', to: EMAIL, language: 'en', params: { name: 'Mari' } });
    expect((resetJob.data as MailJob).params.url).toMatch(/\/api\/v1\/auth\/reset-password\/[^?]+\?callbackURL=kapp%3A%2F%2Fnew-password/);
    expect(resetJob.id).toMatch(/^mail-password-reset-[0-9a-f]{40}$/);
  });

  it('the same job id is queued once (idempotent per template, user and token)', async () => {
    const before = await queue.queue.count();
    const job = (await queue.queue.getJobs(['waiting']))[0]!;
    await queue.enqueue(job.data as MailJob, job.id!);
    expect(await queue.queue.count()).toBe(before);
  });

  it('the worker sends both in English and then strips the address and link from the jobs', async () => {
    const sent: OutgoingEmail[] = [];
    const transport: MailTransport = { name: 'log', send: async (email) => void sent.push(email) };
    const worker = startMailWorker(connection, createMailProcessor({ transport, from: 'Käpp <noreply@kapp.example>' }), silent);
    try {
      for (let i = 0; i < 50 && sent.length < 2; i++) await new Promise((r) => setTimeout(r, 100));
      // Let the worker finish updating the jobs after the last send.
      for (let i = 0; i < 50 && (await queue.queue.getCompletedCount()) < 2; i++) await new Promise((r) => setTimeout(r, 100));
    } finally {
      await worker.close();
    }
    expect(sent.map((e) => e.subject).sort()).toEqual(['Käpp: confirm your email address', 'Käpp: reset your password']);
    expect(sent.every((e) => e.to === EMAIL && e.from === 'Käpp <noreply@kapp.example>')).toBe(true);
    const verify = sent.find((e) => e.subject.includes('confirm'))!;
    expect(verify.text).toContain('/api/v1/auth/verify-email?token=');

    const done = await queue.queue.getJobs(['completed']);
    expect(done).toHaveLength(2);
    for (const job of done) {
      expect(job.data as RedactedMailJob).toEqual({ template: job.name, redacted: true });
      expect(JSON.stringify(job.data)).not.toContain(EMAIL);
    }
  });
});
