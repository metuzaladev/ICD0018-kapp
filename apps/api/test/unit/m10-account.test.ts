import { LEGAL_VERSIONS, legalAcceptanceCurrent } from '@kapp/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, ForbiddenError, NotFoundError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import type { AccountOwner, AccountRepository, DeletedAccount } from '../../src/modules/account/account.repository';
import { createAccountService, REAUTH_WINDOW_MS, type AccountAuth } from '../../src/modules/account/account.service';
import { createStorageCleanupProcessor, storageCleanupJobId } from '../../src/modules/account/storage-cleanup';
import { mockAll, mockStorage, USER_ID } from '../helpers';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const owner = (overrides: Partial<AccountOwner> = {}): AccountOwner => ({
  email: 'mari@example.com',
  name: 'Mari Tamm',
  language: 'en',
  emailVerified: false,
  hasPassword: true,
  ...overrides,
});
const deleted: DeletedAccount = {
  storageKeys: ['dogs/d1/p1/full.webp', 'dogs/d1/p1/thumb.webp'],
  storagePrefixes: ['dogs/d1/', `uploads/${USER_ID}/`],
  cancelledBookingIds: ['b1', 'b2'],
};

function setup(overrides: { owner?: AccountOwner | null; passwordOk?: boolean } = {}) {
  const repository = mockAll<AccountRepository>(['findOwner', 'deleteAccount', 'acceptLegal', 'exportData']);
  repository.findOwner.mockResolvedValue(overrides.owner === undefined ? owner() : overrides.owner);
  repository.deleteAccount.mockResolvedValue(deleted);
  const auth = mockAll<AccountAuth>(['verifyPassword', 'sendVerificationEmail']);
  auth.verifyPassword.mockResolvedValue(overrides.passwordOk ?? true);
  auth.sendVerificationEmail.mockResolvedValue('sent');
  const storageCleanup = { enqueue: vi.fn(async () => {}) };
  const reminders = { cancel: vi.fn(async () => {}) };
  const mailer = { sendAccountDeleted: vi.fn(async () => {}) };
  const log = { info: vi.fn(), error: vi.fn() };
  const service = createAccountService({ repository, auth, storageCleanup, reminders, mailer, log, timeoutMs: 1000, now: () => NOW });
  return { service, repository, auth, storageCleanup, reminders, mailer, log };
}

const freshSession = new Date(NOW - 60_000);

afterEach(() => vi.useRealTimers());

describe('AccountService.deleteAccount — re-authentication', () => {
  it('a password account must send its password (403 with a clear key)', async () => {
    const { service, repository } = setup();
    await expect(service.deleteAccount(USER_ID, { sessionCreatedAt: freshSession })).rejects.toMatchObject({ statusCode: 403, key: 'errors.reauthPasswordRequired' });
    expect(repository.deleteAccount).not.toHaveBeenCalled();
  });

  it('a wrong password is 403 and deletes nothing — even with a fresh session', async () => {
    const { service, repository, auth } = setup({ passwordOk: false });
    await expect(service.deleteAccount(USER_ID, { password: 'wrong', sessionCreatedAt: freshSession })).rejects.toMatchObject({ key: 'errors.reauthPasswordWrong' });
    expect(auth.verifyPassword).toHaveBeenCalledWith(USER_ID, 'wrong');
    expect(repository.deleteAccount).not.toHaveBeenCalled();
  });

  it('a password account with an old session is fine when the password is right', async () => {
    const { service, repository } = setup();
    await service.deleteAccount(USER_ID, { password: 'pikk-parool-123', sessionCreatedAt: new Date(0) });
    expect(repository.deleteAccount).toHaveBeenCalledWith(USER_ID);
  });

  it('an Apple/Google account (no password) needs a sign-in within the window', async () => {
    const { service, repository, auth } = setup({ owner: owner({ hasPassword: false }) });
    await service.deleteAccount(USER_ID, { sessionCreatedAt: new Date(NOW - REAUTH_WINDOW_MS + 1000) });
    expect(repository.deleteAccount).toHaveBeenCalledOnce();
    expect(auth.verifyPassword).not.toHaveBeenCalled();
  });

  it('an Apple/Google account with an older session must sign in again (403 errors.reauthRequired)', async () => {
    const { service, repository } = setup({ owner: owner({ hasPassword: false }) });
    await expect(service.deleteAccount(USER_ID, { sessionCreatedAt: new Date(NOW - REAUTH_WINDOW_MS - 1000) })).rejects.toMatchObject({
      statusCode: 403,
      key: 'errors.reauthRequired',
    });
    // A password sent by a password-less account does not bypass the window.
    await expect(service.deleteAccount(USER_ID, { password: 'x', sessionCreatedAt: new Date(0) })).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.deleteAccount).not.toHaveBeenCalled();
  });

  it('the user no longer exists → 404 (a second device deleted it first)', async () => {
    const gone = setup({ owner: null });
    await expect(gone.service.deleteAccount(USER_ID, { password: 'x', sessionCreatedAt: freshSession })).rejects.toBeInstanceOf(NotFoundError);
    const race = setup();
    race.repository.deleteAccount.mockResolvedValue(null);
    await expect(race.service.deleteAccount(USER_ID, { password: 'x', sessionCreatedAt: freshSession })).rejects.toMatchObject({ key: 'errors.userNotFound' });
    expect(race.storageCleanup.enqueue).not.toHaveBeenCalled();
    expect(race.mailer.sendAccountDeleted).not.toHaveBeenCalled();
  });
});

describe('AccountService.deleteAccount — after the commit', () => {
  it('queues the storage cleanup with the collected keys, cancels reminders, emails the confirmation, logs an audit line without PII', async () => {
    const { service, storageCleanup, reminders, mailer, log } = setup();
    await service.deleteAccount(USER_ID, { password: 'pikk-parool-123', sessionCreatedAt: freshSession });

    expect(storageCleanup.enqueue).toHaveBeenCalledWith({ userId: USER_ID, keys: deleted.storageKeys, prefixes: deleted.storagePrefixes });
    expect(reminders.cancel.mock.calls).toEqual([['b1'], ['b2']]);
    // The address is read before deletion: the email still reaches the person in their language.
    expect(mailer.sendAccountDeleted).toHaveBeenCalledWith({ userId: USER_ID, to: 'mari@example.com', name: 'Mari Tamm', language: 'en' });
    expect(log.info).toHaveBeenCalledWith(
      { event: 'account_deleted', userId: USER_ID, method: 'password', objects: 2, bookingsCancelled: 2 },
      'account deleted',
    );
    expect(JSON.stringify(log.info.mock.calls)).not.toMatch(/mari|Tamm/i);
  });

  it('a storage queue failure is logged (ids only) and does not fail the request — the rows are already gone', async () => {
    const { service, storageCleanup, mailer, log } = setup();
    storageCleanup.enqueue.mockRejectedValue(new Error('redis down'));
    await expect(service.deleteAccount(USER_ID, { password: 'x', sessionCreatedAt: freshSession })).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID, objects: 2 }), expect.stringContaining('storage cleanup'));
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('mari@example.com');
    expect(mailer.sendAccountDeleted).toHaveBeenCalledOnce();
  });

  it('a hanging queue or reminder removal is cut off; the deletion still succeeds', async () => {
    vi.useFakeTimers();
    const { service, storageCleanup, reminders, log } = setup();
    storageCleanup.enqueue.mockReturnValue(new Promise(() => {}));
    reminders.cancel.mockReturnValue(new Promise(() => {}));
    const pending = service.deleteAccount(USER_ID, { password: 'x', sessionCreatedAt: freshSession });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledTimes(3);
  });

  it('a slow database becomes a TimeoutError (→ 503); nothing after it runs', async () => {
    vi.useFakeTimers();
    const { service, repository, storageCleanup } = setup();
    repository.deleteAccount.mockReturnValue(new Promise(() => {}));
    const pending = service.deleteAccount(USER_ID, { password: 'x', sessionCreatedAt: freshSession });
    const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
    expect(storageCleanup.enqueue).not.toHaveBeenCalled();
  });

  it('a hanging password check times out too', async () => {
    vi.useFakeTimers();
    const { service, auth } = setup();
    auth.verifyPassword.mockReturnValue(new Promise(() => {}));
    const assertion = expect(service.deleteAccount(USER_ID, { password: 'x', sessionCreatedAt: freshSession })).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
  });
});

describe('AccountService legal, export and verification', () => {
  const current = { termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy };

  it('records only the current versions (409 for stale ones)', async () => {
    const { service, repository } = setup();
    repository.acceptLegal.mockResolvedValue({ ...current, acceptedAt: '2026-10-05T12:00:00.000Z' });
    await expect(service.acceptLegal(USER_ID, current)).resolves.toMatchObject(current);
    await expect(service.acceptLegal(USER_ID, { ...current, termsVersion: '2020-01-01' })).rejects.toMatchObject({ statusCode: 409, key: 'errors.legalVersionOutdated' });
    expect(repository.acceptLegal).toHaveBeenCalledOnce();
  });

  it('legalAcceptanceCurrent: null (never accepted) and old versions are outdated', () => {
    expect(legalAcceptanceCurrent(current)).toBe(true);
    expect(legalAcceptanceCurrent({ termsVersion: null, privacyVersion: null })).toBe(false);
    expect(legalAcceptanceCurrent({ ...current, privacyVersion: '2020-01-01' })).toBe(false);
  });

  it('export wraps the sections with a format and timestamp; 404 for a missing user', async () => {
    const { service, repository } = setup();
    repository.exportData.mockResolvedValueOnce({ account: { id: USER_ID } }).mockResolvedValueOnce(null);
    await expect(service.exportData(USER_ID)).resolves.toEqual({ exportedAt: '2026-10-05T12:00:00.000Z', format: 'kapp-export/1', sections: { account: { id: USER_ID } } });
    await expect(service.exportData(USER_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('resends the confirmation to the account address; 409 when already confirmed', async () => {
    const { service, auth } = setup();
    const request = { headers: { cookie: 'kapp.session_token=x' } };
    await service.resendVerification(USER_ID, request);
    expect(auth.sendVerificationEmail).toHaveBeenCalledWith(request, 'mari@example.com');

    const verified = setup({ owner: owner({ emailVerified: true }) });
    await expect(verified.service.resendVerification(USER_ID, request)).rejects.toBeInstanceOf(ConflictError);
    expect(verified.auth.sendVerificationEmail).not.toHaveBeenCalled();

    const raced = setup();
    raced.auth.sendVerificationEmail.mockResolvedValue('already-verified');
    await expect(raced.service.resendVerification(USER_ID, request)).rejects.toMatchObject({ key: 'errors.emailAlreadyVerified' });
  });
});

describe('storage cleanup job', () => {
  it('removes the exact keys and every prefix; running it again is harmless (idempotent)', async () => {
    const { storage, objects } = mockStorage();
    for (const key of ['dogs/d1/p1/full.webp', 'dogs/d1/p1/thumb.webp', 'dogs/d1/orphan/full.webp', `uploads/${USER_ID}/raw.jpg`, 'dogs/other/p/full.webp']) {
      objects.set(key, { body: Buffer.from('x'), contentType: 'image/webp' });
    }
    const process = createStorageCleanupProcessor(storage);
    const data = { userId: USER_ID, keys: ['dogs/d1/p1/full.webp', 'dogs/d1/p1/thumb.webp'], prefixes: ['dogs/d1/', `uploads/${USER_ID}/`] };
    await process({ data });
    await process({ data });
    expect([...objects.keys()]).toEqual(['dogs/other/p/full.webp']);
  });

  it('a storage error is thrown so BullMQ retries the job', async () => {
    const { storage } = mockStorage();
    storage.remove.mockRejectedValue(new Error('R2 503'));
    await expect(createStorageCleanupProcessor(storage)({ data: { userId: USER_ID, keys: ['a'], prefixes: [] } })).rejects.toThrow('R2 503');
  });

  it('job ids are per account and valid for BullMQ (no ":")', () => {
    expect(storageCleanupJobId('abc:def')).toBe('account-abc_def');
  });
});
