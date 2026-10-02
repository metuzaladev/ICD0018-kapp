import type { Language } from '@kapp/shared';
import { Queue, Worker, type Job } from 'bullmq';

/**
 * The push pipeline's queue (M5): requests only enqueue a small job, a BullMQ worker talks to the
 * Expo push service. Why a queue (docs/12-kogukond.md): the Expo call is a slow external request
 * that can fail or rate-limit; it must never delay or fail "send message", and failed sends need
 * retries with backoff that survive a restart — BullMQ keeps jobs in Redis.
 */

export const PUSH_QUEUE_NAME = 'push';

/** One push to all devices of one user. Texts are already in the recipient's language. */
export interface PushJob {
  userId: string;
  language: Language;
  title: string;
  body: string;
  /** Delivered to the app (notification tap → screen); strings only. */
  data: Record<string, string>;
  /** Set by the worker on a retry: only the devices that failed transiently are tried again. */
  tokens?: string[];
}

/** Ticket id → token, checked ~15 min later for DeviceNotRegistered receipts. */
export interface ReceiptsJob {
  receipts: Record<string, string>;
}

export interface PushQueue {
  enqueue(job: PushJob): Promise<void>;
  scheduleReceipts(job: ReceiptsJob): Promise<void>;
  close(): Promise<void>;
}

export interface QueueConnection {
  url: string;
  prefix: string;
}

/** Expo's guidance: fetch receipts after some minutes, they exist for about a day. */
export const RECEIPT_DELAY_MS = 15 * 60_000;

const connectionOptions = (url: string) => ({
  url,
  // BullMQ workers need this; for the queue it makes a dead Redis fail fast instead of buffering
  // commands, so the request path sees an error (logged by the notifier) instead of hanging.
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
});

export function createPushQueue({ url, prefix }: QueueConnection): PushQueue & { queue: Queue } {
  const queue = new Queue(PUSH_QUEUE_NAME, {
    connection: { ...connectionOptions(url), maxRetriesPerRequest: 1 },
    prefix,
    defaultJobOptions: {
      // 5 tries over ~5 minutes (10 s, 20 s, 40 s, 80 s, 160 s): long enough for a short Expo or
      // network outage, short enough that a "new message" push does not arrive an hour late.
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
  // Without a listener an unreachable Redis would crash the process with an unhandled 'error'.
  queue.on('error', () => {});

  return {
    queue,
    async enqueue(job) {
      await queue.add('send', job);
    },
    async scheduleReceipts(job) {
      await queue.add('receipts', job, { delay: RECEIPT_DELAY_MS });
    },
    async close() {
      await queue.close();
    },
  };
}

export type PushJobProcessor = (job: Pick<Job, 'name' | 'data' | 'updateData' | 'attemptsMade'>) => Promise<void>;

export function startPushWorker(
  { url, prefix }: QueueConnection,
  processor: PushJobProcessor,
  log: { warn: (obj: object, msg: string) => void },
): Worker {
  const worker = new Worker(PUSH_QUEUE_NAME, processor, { connection: connectionOptions(url), prefix, concurrency: 5 });
  worker.on('failed', (job, err) => log.warn({ err, jobId: job?.id, attempts: job?.attemptsMade }, 'push job failed'));
  worker.on('error', (err) => log.warn({ err }, 'push worker error'));
  return worker;
}
