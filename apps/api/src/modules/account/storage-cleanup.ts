import { Queue, Worker, type Job } from 'bullmq';

import type { ObjectStorage } from '../../storage/object-storage';
import type { QueueConnection } from '../notifications/push-queue';

/**
 * Deletes a deleted account's files from object storage (M10, docs/17) — after the database
 * transaction has committed, as a BullMQ job with retries.
 *
 * Why after the commit and in a queue: the rows go first, so a storage outage can never make data
 * reappear (the opposite order could leave rows pointing at deleted files, or roll back after files
 * are gone). An orphaned private object only costs space and is retried; R2/S3 calls can be slow,
 * so they must not hold the request. Deleting a missing key is not an error, so the job is
 * idempotent and safe to retry. Only ids and counts are logged, never keys with names.
 */

const STORAGE_CLEANUP_QUEUE = 'storage-cleanup';

export interface StorageCleanupJob {
  /** The deleted user's id — job id and log correlation only; the user no longer exists. */
  userId: string;
  /** Exact object keys (photo full + thumbnail, report photos, health documents). */
  keys: string[];
  /** Prefixes owned by the account (`dogs/<dogId>/`, `places/<postId>/`, `uploads/<userId>/`). */
  prefixes: string[];
}

export interface StorageCleanup {
  enqueue(job: StorageCleanupJob): Promise<void>;
}

export const noStorageCleanup: StorageCleanup = { enqueue: async () => {} };

/** One job per deleted account; BullMQ forbids ':' in custom ids. */
export const storageCleanupJobId = (userId: string) => `account-${userId.replace(/:/g, '_')}`;

export function createStorageCleanupQueue({ url, prefix }: QueueConnection): StorageCleanup & { queue: Queue; close(): Promise<void> } {
  const queue = new Queue<StorageCleanupJob>(STORAGE_CLEANUP_QUEUE, {
    connection: { url, maxRetriesPerRequest: 1, enableOfflineQueue: false },
    prefix,
    defaultJobOptions: {
      // ~10 tries over ~8.5 hours (30 s doubling): rides out an R2 outage; failures stay in Redis for
      // a week so they can be retried by hand (docs/17).
      attempts: 10,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
  queue.on('error', () => {});
  return {
    queue,
    async enqueue(job) {
      await queue.add('delete-account-files', job, { jobId: storageCleanupJobId(job.userId) });
    },
    async close() {
      await queue.close();
    },
  };
}

export type StorageCleanupProcessor = (job: Pick<Job<StorageCleanupJob>, 'data'>) => Promise<void>;

export function createStorageCleanupProcessor(storage: Pick<ObjectStorage, 'remove' | 'removePrefix'>): StorageCleanupProcessor {
  return async ({ data }) => {
    await storage.remove(data.keys);
    for (const prefix of data.prefixes) await storage.removePrefix(prefix);
  };
}

export function startStorageCleanupWorker(
  { url, prefix }: QueueConnection,
  processor: StorageCleanupProcessor,
  log: { warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void },
): Worker {
  const worker = new Worker<StorageCleanupJob>(STORAGE_CLEANUP_QUEUE, processor, {
    connection: { url, maxRetriesPerRequest: null, enableOfflineQueue: false },
    prefix,
    concurrency: 2,
  });
  worker.on('failed', (job, err) => {
    const final = job ? job.attemptsMade >= (job.opts.attempts ?? 1) : false;
    log[final ? 'error' : 'warn']({ jobId: job?.id, attempts: job?.attemptsMade, err: { name: err.name } }, final ? 'storage cleanup failed permanently' : 'storage cleanup failed, will retry');
  });
  worker.on('error', (err) => log.warn({ err }, 'storage cleanup worker error'));
  return worker;
}
