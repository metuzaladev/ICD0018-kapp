import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import { createFavoritesService } from '../../src/modules/favorites/favorites.service';
import { makePark, makeParkDetailRecord, mockFavoritesRepository, mockRepository, PARK_ID, USER_ID } from '../helpers';

const TIMEOUT_MS = 1000;

describe('FavoritesService', () => {
  let favorites: ReturnType<typeof mockFavoritesRepository>;
  let parks: ReturnType<typeof mockRepository>;
  let service: ReturnType<typeof createFavoritesService>;

  beforeEach(() => {
    favorites = mockFavoritesRepository();
    parks = mockRepository();
    service = createFavoritesService({ favorites, parks, timeoutMs: TIMEOUT_MS });
  });

  afterEach(() => vi.useRealTimers());

  it('adds an approved park', async () => {
    parks.findById.mockResolvedValue(makeParkDetailRecord());
    await service.add(USER_ID, PARK_ID);
    expect(favorites.add).toHaveBeenCalledWith(USER_ID, PARK_ID);
  });

  it.each([
    ['missing (null)', null],
    ['pending', makeParkDetailRecord({ status: 'pending' })],
    ['rejected', makeParkDetailRecord({ status: 'rejected' })],
  ])('refuses a %s park with 404 and writes nothing', async (_case, record) => {
    parks.findById.mockResolvedValue(record);
    await expect(service.add(USER_ID, PARK_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(favorites.add).not.toHaveBeenCalled();
  });

  it('removes without checking the park, so rejected parks can still be removed', async () => {
    await service.remove(USER_ID, PARK_ID);
    expect(parks.findById).not.toHaveBeenCalled();
    expect(favorites.remove).toHaveBeenCalledWith(USER_ID, PARK_ID);
  });

  it('lists the user favourites', async () => {
    favorites.listParks.mockResolvedValue([makePark()]);
    await expect(service.list(USER_ID)).resolves.toEqual([makePark()]);
  });

  it('times out when the park lookup hangs', async () => {
    vi.useFakeTimers();
    parks.findById.mockReturnValue(new Promise(() => {}));
    const result = service.add(USER_ID, PARK_ID);
    vi.advanceTimersByTime(TIMEOUT_MS);
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
    expect(favorites.add).not.toHaveBeenCalled();
  });
});
