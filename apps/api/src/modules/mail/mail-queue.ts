import { createHash } from 'node:crypto';

import type { Language } from '@kapp/shared';
import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';

import type { QueueConnection } from '../notifications/push-queue';
import { renderEmail, type MailParams, type MailTemplate } from './mail-templates';
import { MailDeliveryError, type MailTransport } from './mail-transport';

/**
 * The email pipeline (M10), the same pattern as push (docs/12): a request only enqueues a small job,
 * a BullMQ worker renders and sends it. Why a queue: an email provider is a slow external service
 * that can fail; a password reset must not hang or fail on it, and transient failures need retries
 * with backoff that survive a restart.
 *
 * Personal data in Redis: a job carries the recipient address and, for links, a credential. Both are
 * removed from the job (`redactMailJob`) as soon as it is sent or has failed for good, while the job
 * id stays for idempotency. Nothing about the recipient is ever logged.
 */

const MAIL_QUEUE_NAME = 'mail';

export interface MailJob {
  template: MailTemplate;
  to: string;
  language: Language;
  params: MailParams;
}

/** What is left of a job once it is done: enough to see that it ran, nothing personal. */
export interface RedactedMailJob {
  template: MailTemplate;
  redacted: true;
}

export const redactMailJob = (job: MailJob | RedactedMailJob): RedactedMailJob => ({ template: job.template, redacted: true });

/**
 * Deterministic job id per (template, user, token): the same reset link or the same deletion is
 * queued and sent once, even if the request that triggered it is retried. Hashed, because user ids
 * and tokens must not appear in Redis keys; BullMQ forbids ':' in custom ids.
 */
export function mailJobId(template: MailTemplate, userId: string, token: string): string {
  return `mail-${template}-${createHash('sha256').update(`${template}\u0000${userId}\u0000${token}`).digest('hex').slice(0, 40)}`;
}

export interface MailQueue {
  enqueue(job: MailJob, jobId: string): Promise<void>;
  close(): Promise<void>;
}

export function createMailQueue({ url, prefix }: QueueConnection): MailQueue & { queue: Queue } {
  const queue = new Queue(MAIL_QUEUE_NAME, {
    // Same reasoning as push-queue.ts: fail fast instead of buffering when Redis is down.
    connection: { url, maxRetriesPerRequest: 1, enableOfflineQueue: false },
    prefix,
    defaultJobOptions: {
      // 6 tries over ~30 minutes (15 s … 8 min): a reset link older than that is less useful, and
      // the link itself expires after an hour.
      attempts: 6,
      backoff: { type: 'exponential', delay: 15_000 },
      // Kept (redacted) for a day so a duplicate request within that time is recognised by its id.
      removeOnComplete: { age: 24 * 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
  queue.on('error', () => {});
  return {
    queue,
    async enqueue(job, jobId) {
      await queue.add(job.template, job, { jobId });
    },
    async close() {
      await queue.close();
    },
  };
}

export type MailJobProcessor = (job: Pick<Job, 'id' | 'name' | 'data' | 'updateData' | 'attemptsMade'>) => Promise<void>;

export function createMailProcessor({ transport, from }: { transport: MailTransport; from: string }): MailJobProcessor {
  return async (job) => {
    const data = job.data as MailJob | RedactedMailJob;
    if ('redacted' in data) return; // already sent (or given up) — never send from a redacted job
    const email = renderEmail(data.template, data.language, data.params);
    try {
      await transport.send({ from, to: data.to, ...email, idempotencyKey: job.id ?? mailJobId(data.template, data.to, 'no-id') });
    } catch (error) {
      if (error instanceof MailDeliveryError && error.permanent) {
        await job.updateData(redactMailJob(data));
        // UnrecoverableError: BullMQ fails the job without using the remaining attempts.
        throw new UnrecoverableError(error.message);
      }
      throw error instanceof MailDeliveryError ? error : new MailDeliveryError('mail send failed (unexpected error)', false);
    }
    await job.updateData(redactMailJob(data));
  };
}

export function startMailWorker(
  { url, prefix }: QueueConnection,
  processor: MailJobProcessor,
  log: { warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void },
): Worker {
  const worker = new Worker(MAIL_QUEUE_NAME, processor, { connection: { url, maxRetriesPerRequest: null, enableOfflineQueue: false }, prefix, concurrency: 3 });
  worker.on('failed', (job, err) => {
    if (!job) return;
    const final = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
    // Only the template, the job id and our own sanitised message (no address, no link).
    log[final ? 'error' : 'warn']({ jobId: job.id, template: job.name, attempts: job.attemptsMade, reason: err.message }, final ? 'email failed permanently' : 'email send failed, will retry');
    if (final) void job.updateData(redactMailJob(job.data as MailJob)).catch(() => {});
  });
  worker.on('error', (err) => log.warn({ err }, 'mail worker error'));
  return worker;
}
