import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createShutdown, type ShutdownStep } from '../../src/lib/graceful-shutdown';

const makeLog = () => ({ info: vi.fn(), error: vi.fn() });

describe('createShutdown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('closes every step in order and exits 0', async () => {
    const order: string[] = [];
    const steps: ShutdownStep[] = ['http', 'workers', 'db'].map((name) => ({ name, close: async () => void order.push(name) }));
    const exit = vi.fn();

    await createShutdown({ steps, timeoutMs: 1000, log: makeLog(), exit })('SIGTERM');

    expect(order).toEqual(['http', 'workers', 'db']);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('keeps closing after a failing step and exits 1', async () => {
    const db = vi.fn(async () => {});
    const log = makeLog();
    const exit = vi.fn();
    const steps: ShutdownStep[] = [
      { name: 'redis', close: async () => Promise.reject(new Error('connection is closed')) },
      { name: 'db', close: db },
    ];

    await createShutdown({ steps, timeoutMs: 1000, log, exit })('SIGTERM');

    expect(db).toHaveBeenCalledOnce();
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ step: 'redis' }), 'shutdown step failed');
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('exits 1 at the deadline when a step hangs, and never exits twice', async () => {
    const exit = vi.fn();
    const after = vi.fn(async () => {});
    const steps: ShutdownStep[] = [
      { name: 'worker', close: () => new Promise(() => {}) }, // never settles
      { name: 'db', close: after },
    ];

    void createShutdown({ steps, timeoutMs: 500, log: makeLog(), exit })('SIGTERM');
    await vi.advanceTimersByTimeAsync(499);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(after).not.toHaveBeenCalled();
  });

  it('ignores a second signal while shutting down', async () => {
    let release: () => void = () => {};
    const close = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const exit = vi.fn();
    const log = makeLog();
    const shutdown = createShutdown({ steps: [{ name: 'http', close }], timeoutMs: 1000, log, exit });

    const first = shutdown('SIGTERM');
    await shutdown('SIGINT');
    release();
    await first;

    expect(close).toHaveBeenCalledOnce();
    expect(log.info).toHaveBeenCalledWith({ signal: 'SIGINT' }, 'shutdown already in progress');
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('exits 0 with no steps (nothing to close)', async () => {
    const exit = vi.fn();
    await createShutdown({ steps: [], timeoutMs: 1000, log: makeLog(), exit })('SIGTERM');
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });
});
