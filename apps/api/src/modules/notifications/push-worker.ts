import { Expo, type ExpoClientOptions, type ExpoPushMessage, type ExpoPushReceipt, type ExpoPushTicket } from 'expo-server-sdk';

import type { PushTokensRepository } from './notifications.repository';
import type { PushJob, PushJobProcessor, ReceiptsJob } from './push-queue';

/**
 * Sends queued pushes through the Expo push service and keeps `push_tokens` clean.
 *
 * - A device that is gone (`DeviceNotRegistered`, in the ticket or in the receipt ~15 min later)
 *   loses its token, so we stop sending to uninstalled apps.
 * - Transient failures (network, 5xx, `MessageRateExceeded`) make the job throw; BullMQ retries it
 *   with exponential backoff, and only the devices that failed are tried again (no duplicates).
 * - Permanent per-message errors (bad credentials, message too big) are not retried.
 */

/** The part of the Expo SDK the worker uses; tests replace it (or its HTTP transport). */
export interface PushClient {
  send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
  receipts(ids: string[]): Promise<Record<string, ExpoPushReceipt>>;
}

export function createExpoPushClient(options: Partial<ExpoClientOptions> = {}): PushClient {
  const expo = new Expo(options);
  return {
    async send(messages) {
      const tickets: ExpoPushTicket[] = [];
      // Chunks of 100 (Expo's limit); throws on network / HTTP errors → the job is retried.
      for (const chunk of expo.chunkPushNotifications(messages)) tickets.push(...(await expo.sendPushNotificationsAsync(chunk)));
      return tickets;
    },
    async receipts(ids) {
      const result: Record<string, ExpoPushReceipt> = {};
      for (const chunk of expo.chunkPushNotificationReceiptIds(ids)) Object.assign(result, await expo.getPushNotificationReceiptsAsync(chunk));
      return result;
    },
  };
}

const RETRYABLE = new Set(['MessageRateExceeded', 'ExpoError']);

export class PushRetryError extends Error {
  constructor(readonly tokens: string[]) {
    super(`push failed transiently for ${tokens.length} device(s); retrying`);
    this.name = 'PushRetryError';
  }
}

export function createPushProcessor({
  tokens: tokensRepository,
  client,
  scheduleReceipts,
}: {
  tokens: Pick<PushTokensRepository, 'listForUser' | 'removeTokens'>;
  client: PushClient;
  scheduleReceipts: (job: ReceiptsJob) => Promise<void>;
}): PushJobProcessor {
  async function send(job: Parameters<PushJobProcessor>[0]) {
    const data = job.data as PushJob;
    const tokens = data.tokens ?? (await tokensRepository.listForUser(data.userId));
    if (tokens.length === 0) return;

    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      title: data.title,
      body: data.body,
      data: data.data,
      sound: 'default',
      // Android: the channel the app creates (lib/push.ts); iOS: group by conversation.
      channelId: 'default',
      ...(data.data.conversationId ? { threadId: data.data.conversationId } : {}),
    }));
    const tickets = await client.send(messages);

    const gone: string[] = [];
    const retry: string[] = [];
    const receipts: Record<string, string> = {};
    tickets.forEach((ticket, i) => {
      const token = tokens[i]!;
      if (ticket.status === 'ok') receipts[ticket.id] = token;
      else if (ticket.details?.error === 'DeviceNotRegistered') gone.push(token);
      else if (ticket.details?.error && RETRYABLE.has(ticket.details.error)) retry.push(token);
    });

    await tokensRepository.removeTokens(gone);
    if (Object.keys(receipts).length > 0) await scheduleReceipts({ receipts });
    if (retry.length > 0) {
      await job.updateData({ ...data, tokens: retry });
      throw new PushRetryError(retry);
    }
  }

  async function checkReceipts(job: Parameters<PushJobProcessor>[0]) {
    const { receipts } = job.data as ReceiptsJob;
    const result = await client.receipts(Object.keys(receipts));
    const gone = Object.entries(result)
      .filter(([, receipt]) => receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered')
      .map(([id]) => receipts[id]!)
      .filter(Boolean);
    await tokensRepository.removeTokens(gone);
  }

  return async (job) => {
    if (job.name === 'receipts') return checkReceipts(job);
    return send(job);
  };
}
