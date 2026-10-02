import { MockAgent } from 'undici';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createExpoPushClient, createPushProcessor, PushRetryError, type PushClient } from '../../src/modules/notifications/push-worker';
import { mockPushTokensRepository } from '../helpers';

const A = 'ExponentPushToken[aaaaaaaaaaaa]';
const B = 'ExponentPushToken[bbbbbbbbbbbb]';
const C = 'ExponentPushToken[cccccccccccc]';

const sendJob = (data: object) => {
  const job = {
    name: 'send',
    data: { userId: 'u1', language: 'et', title: 'Uus sõber', body: 'Mari võttis sinu sõbrakutse vastu', data: { type: 'friend_accepted' }, ...data },
    attemptsMade: 0,
    updateData: vi.fn(async (next: object) => {
      job.data = next as typeof job.data;
    }),
  };
  return job;
};

function setup(client: Partial<PushClient>) {
  const tokens = mockPushTokensRepository();
  tokens.listForUser.mockResolvedValue([A, B, C]);
  tokens.removeTokens.mockResolvedValue(undefined);
  const scheduleReceipts = vi.fn().mockResolvedValue(undefined);
  const processor = createPushProcessor({ tokens, client: client as PushClient, scheduleReceipts });
  return { tokens, scheduleReceipts, processor };
}

describe('push worker', () => {
  it('sends to every device, removes DeviceNotRegistered tokens and schedules receipts', async () => {
    const send = vi.fn().mockResolvedValue([
      { status: 'ok', id: 't1' },
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
    ]);
    const { tokens, scheduleReceipts, processor } = setup({ send });
    await processor(sendJob({}));
    expect(send.mock.calls[0]![0]).toHaveLength(3);
    expect(send.mock.calls[0]![0][0]).toMatchObject({ to: A, title: 'Uus sõber', sound: 'default', channelId: 'default' });
    expect(tokens.removeTokens).toHaveBeenCalledWith([B]);
    expect(scheduleReceipts).toHaveBeenCalledWith({ receipts: { t1: A } });
  });

  it('retries only the devices that failed transiently', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce([
        { status: 'ok', id: 't1' },
        { status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } },
        { status: 'ok', id: 't3' },
      ])
      .mockResolvedValueOnce([{ status: 'ok', id: 't2' }]);
    const { processor } = setup({ send });
    const job = sendJob({});
    await expect(processor(job)).rejects.toBeInstanceOf(PushRetryError);
    expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({ tokens: [B] }));
    // BullMQ calls the processor again with the updated data.
    await processor(job);
    expect(send.mock.calls[1]![0].map((m: { to: string }) => m.to)).toEqual([B]);
  });

  it('a network error throws so BullMQ retries the whole job', async () => {
    const { processor } = setup({ send: vi.fn().mockRejectedValue(new Error('ECONNRESET')) });
    await expect(processor(sendJob({}))).rejects.toThrow('ECONNRESET');
  });

  it('does nothing for a user without devices', async () => {
    const send = vi.fn();
    const { tokens, processor } = setup({ send });
    tokens.listForUser.mockResolvedValue([]);
    await processor(sendJob({}));
    expect(send).not.toHaveBeenCalled();
  });

  it('receipts: removes tokens whose receipt says DeviceNotRegistered', async () => {
    const receipts = vi.fn().mockResolvedValue({
      t1: { status: 'ok' },
      t2: { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    });
    const { tokens, processor } = setup({ receipts });
    await processor({ name: 'receipts', data: { receipts: { t1: A, t2: B } }, attemptsMade: 0, updateData: vi.fn() });
    expect(tokens.removeTokens).toHaveBeenCalledWith([B]);
  });
});

describe('Expo push client (real SDK, mocked Expo endpoint — never the real push service)', () => {
  let agent: MockAgent | undefined;
  afterEach(async () => {
    await agent?.close();
  });

  it('posts the messages to the Expo send API and returns its tickets', async () => {
    agent = new MockAgent();
    agent.disableNetConnect();
    let body: unknown;
    agent
      .get('https://exp.host')
      .intercept({ path: '/--/api/v2/push/send', method: 'POST' })
      .reply(200, (opts) => {
        body = JSON.parse(String(opts.body));
        return { data: [{ status: 'ok', id: 'ticket-1' }] };
      });
    const client = createExpoPushClient({ httpAgent: agent, accessToken: 'test-token' });
    const tickets = await client.send([{ to: A, title: 'Новый друг', body: 'Mari' }]);
    expect(tickets).toEqual([{ status: 'ok', id: 'ticket-1' }]);
    expect(body).toEqual([{ to: A, title: 'Новый друг', body: 'Mari' }]);
  });
});
