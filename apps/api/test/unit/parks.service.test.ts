import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import { createParksService, NEARBY_LIMIT } from '../../src/modules/parks/parks.service';
import { makeParkDetailRecord, makeParkRecord, mockRepository, PARK_ID, USER_ID } from '../helpers';

const TIMEOUT_MS = 1000;

describe('ParksService', () => {
  let repository: ReturnType<typeof mockRepository>;
  let service: ReturnType<typeof createParksService>;

  beforeEach(() => {
    repository = mockRepository();
    service = createParksService({ repository, timeoutMs: TIMEOUT_MS });
  });

  afterEach(() => vi.useRealTimers());

  describe('listNearby', () => {
    it('returns parks with distance rounded to one decimal and a capped result size', async () => {
      repository.findApprovedNearby.mockResolvedValue([makeParkRecord({ distanceKm: 2.2649 })]);

      const parks = await service.listNearby({ lat: 59.437, lng: 24.7536, radiusKm: 5 });

      expect(parks).toHaveLength(1);
      expect(parks[0]?.distanceKm).toBe(2.3);
      expect(repository.findApprovedNearby).toHaveBeenCalledWith({ lat: 59.437, lng: 24.7536 }, 5, NEARBY_LIMIT, {});
    });

    it('passes feature filters to the repository', async () => {
      repository.findApprovedNearby.mockResolvedValue([]);
      await service.listNearby({ lat: 59, lng: 24, radiusKm: 1, water: true, lighting: false });
      expect(repository.findApprovedNearby).toHaveBeenCalledWith({ lat: 59, lng: 24 }, 1, NEARBY_LIMIT, {
        water: true,
        lighting: false,
      });
    });

    it('returns an empty list when nothing is nearby', async () => {
      repository.findApprovedNearby.mockResolvedValue([]);
      await expect(service.listNearby({ lat: 0, lng: 0, radiusKm: 1 })).resolves.toEqual([]);
    });

    it('propagates repository failures unchanged', async () => {
      const failure = new Error('connection lost');
      repository.findApprovedNearby.mockRejectedValue(failure);
      await expect(service.listNearby({ lat: 0, lng: 0, radiusKm: 1 })).rejects.toBe(failure);
    });

    it('fails with TimeoutError when the repository hangs', async () => {
      vi.useFakeTimers();
      repository.findApprovedNearby.mockReturnValue(new Promise(() => {}));

      const result = service.listNearby({ lat: 0, lng: 0, radiusKm: 1 });
      vi.advanceTimersByTime(TIMEOUT_MS);

      await expect(result).rejects.toBeInstanceOf(TimeoutError);
    });
  });

  describe('getPublicPark', () => {
    it('returns an approved park with its review summary', async () => {
      repository.findById.mockResolvedValue(makeParkDetailRecord());
      await expect(service.getPublicPark(PARK_ID)).resolves.toMatchObject({
        id: PARK_ID,
        status: 'approved',
        ratingAverage: 4.8,
        reviewCount: 32,
      });
      expect(repository.findById).toHaveBeenCalledWith(PARK_ID, undefined);
    });

    it('asks for favourite state only for a signed-in viewer', async () => {
      repository.findById.mockResolvedValue(makeParkDetailRecord({ isFavorite: true }));
      await expect(service.getPublicPark(PARK_ID, USER_ID)).resolves.toMatchObject({ isFavorite: true });
      expect(repository.findById).toHaveBeenCalledWith(PARK_ID, USER_ID);
    });

    it('keeps a missing rating as null (park without reviews)', async () => {
      repository.findById.mockResolvedValue(makeParkDetailRecord({ ratingAverage: null, reviewCount: 0 }));
      await expect(service.getPublicPark(PARK_ID)).resolves.toMatchObject({ ratingAverage: null, reviewCount: 0 });
    });

    it('throws NotFoundError when the park does not exist (null)', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getPublicPark(PARK_ID)).rejects.toBeInstanceOf(NotFoundError);
    });

    it.each(['pending', 'rejected'] as const)('hides a %s park behind 404', async (status) => {
      repository.findById.mockResolvedValue(makeParkRecord({ status }));
      await expect(service.getPublicPark(PARK_ID)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('keeps null optional fields as null', async () => {
      repository.findById.mockResolvedValue(makeParkRecord({ description: null, address: null }));
      await expect(service.getPublicPark(PARK_ID)).resolves.toMatchObject({ description: null, address: null });
    });
  });

  describe('suggestPark', () => {
    const input = {
      name: 'Uus park',
      description: null,
      address: null,
      lat: 59.4,
      lng: 24.7,
      fenced: false,
      smallDogArea: false,
      water: false,
      lighting: false,
    };

    it('stores the suggestion with the signed-in user as author', async () => {
      repository.create.mockResolvedValue(makeParkRecord({ ...input, status: 'pending' }));

      const park = await service.suggestPark(USER_ID, input);

      expect(repository.create).toHaveBeenCalledWith({ ...input, createdBy: USER_ID });
      expect(park.status).toBe('pending');
    });

    it('fails with TimeoutError when the insert hangs', async () => {
      vi.useFakeTimers();
      repository.create.mockReturnValue(new Promise(() => {}));

      const result = service.suggestPark(USER_ID, input);
      vi.advanceTimersByTime(TIMEOUT_MS);

      await expect(result).rejects.toBeInstanceOf(TimeoutError);
    });
  });
});
