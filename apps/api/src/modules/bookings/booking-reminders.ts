import { Queue, Worker, type Job } from 'bullmq';

import type { QueueConnection } from '../notifications/push-queue';

/**
 * Booking reminders (M6) as delayed BullMQ jobs in the same Redis as the push queue.
 *
 * Why a delayed job and not a cron scan: one job per booking fires at exactly the right moment and
 * survives restarts (it lives in Redis); nothing has to poll the bookings table. The job carries only
 * the booking id — the worker re-reads the booking, so a cancelled or deleted booking is simply
 * skipped even if removing the job failed. The reminder itself goes through the Notifier, which
 * respects the "Broneeringute uuendused" preference and writes in the user's language.
 */

export const BOOKING_REMINDER_QUEUE = 'booking-reminders';

export interface BookingReminderJob {
  bookingId: string;
}

export interface BookingReminders {
  schedule(bookingId: string, at: Date): Promise<void>;
  /** Best effort; the worker checks the booking's status anyway. */
  cancel(bookingId: string): Promise<void>;
}

export const noBookingReminders: BookingReminders = { schedule: async () => {}, cancel: async () => {} };

/** Deterministic id: scheduling twice is a no-op and cancel can find the job (BullMQ forbids ':'). */
export const reminderJobId = (bookingId: string) => `reminder-${bookingId}`;

export function createBookingReminderQueue({ url, prefix }: QueueConnection, now: () => number = Date.now): BookingReminders & { queue: Queue; close(): Promise<void> } {
  const queue = new Queue<BookingReminderJob>(BOOKING_REMINDER_QUEUE, {
    // Same reasoning as push-queue.ts: fail fast instead of buffering when Redis is down.
    connection: { url, maxRetriesPerRequest: 1, enableOfflineQueue: false },
    prefix,
    defaultJobOptions: {
      // A reminder is only useful before the appointment: a few quick retries, then give up.
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 },
    },
  });
  queue.on('error', () => {});

  return {
    queue,
    async schedule(bookingId, at) {
      await queue.add('remind', { bookingId }, { jobId: reminderJobId(bookingId), delay: Math.max(0, at.getTime() - now()) });
    },
    async cancel(bookingId) {
      await queue.remove(reminderJobId(bookingId));
    },
    async close() {
      await queue.close();
    },
  };
}

export function startBookingReminderWorker(
  { url, prefix }: QueueConnection,
  sendReminder: (bookingId: string) => Promise<void>,
  log: { warn: (obj: object, msg: string) => void },
): Worker {
  const worker = new Worker<BookingReminderJob>(
    BOOKING_REMINDER_QUEUE,
    async (job: Pick<Job<BookingReminderJob>, 'data'>) => sendReminder(job.data.bookingId),
    { connection: { url, maxRetriesPerRequest: null, enableOfflineQueue: false }, prefix, concurrency: 5 },
  );
  worker.on('failed', (job, err) => log.warn({ err, jobId: job?.id }, 'booking reminder failed'));
  worker.on('error', (err) => log.warn({ err }, 'booking reminder worker error'));
  return worker;
}
