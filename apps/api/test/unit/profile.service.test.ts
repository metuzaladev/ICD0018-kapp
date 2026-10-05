import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import { createProfileService } from '../../src/modules/profile/profile.service';
import { makeProfile, mockProfileRepository, USER_ID } from '../helpers';

const TIMEOUT_MS = 1000;

describe('ProfileService', () => {
  let repository: ReturnType<typeof mockProfileRepository>;
  let service: ReturnType<typeof createProfileService>;

  beforeEach(() => {
    repository = mockProfileRepository();
    service = createProfileService({ repository, timeoutMs: TIMEOUT_MS });
  });

  afterEach(() => vi.useRealTimers());

  it('returns the own profile', async () => {
    repository.findById.mockResolvedValue(makeProfile());
    await expect(service.getOwnProfile(USER_ID)).resolves.toEqual(makeProfile());
    expect(repository.findById).toHaveBeenCalledWith(USER_ID);
  });

  it('404 when the session belongs to a deleted user (null)', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.getOwnProfile(USER_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('passes the patch through unchanged, keeping explicit nulls', async () => {
    repository.update.mockResolvedValue(makeProfile({ bio: null }));
    await service.updateOwnProfile(USER_ID, { bio: null, area: undefined });
    expect(repository.update).toHaveBeenCalledWith(USER_ID, { bio: null, area: undefined });
  });

  it('404 when updating a user that no longer exists', async () => {
    repository.update.mockResolvedValue(null);
    await expect(service.updateOwnProfile(USER_ID, { name: 'Uus' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('fails with TimeoutError when the database hangs', async () => {
    vi.useFakeTimers();
    repository.findById.mockReturnValue(new Promise(() => {}));
    const result = service.getOwnProfile(USER_ID);
    vi.advanceTimersByTime(TIMEOUT_MS);
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
  });
});
