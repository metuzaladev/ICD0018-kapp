import { describe, expect, it, vi } from 'vitest';

import { createLogMailer } from '../../src/modules/auth/mailer';

const message = { to: 'mari@example.com', name: 'Mari', url: 'https://api.kapp.example/reset?token=secret' };

describe('createLogMailer', () => {
  it('in production logs neither the address nor the reset link (personal data, credential)', async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    await createLogMailer(log, true).sendPasswordReset(message);

    expect(log.info).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.error.mock.calls)).not.toMatch(/mari@example\.com|token=secret/);
  });

  it('in development logs the link so resets can be tested locally', async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    await createLogMailer(log, false).sendPasswordReset(message);

    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ url: message.url }), expect.any(String));
  });
});
