import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, ForbiddenError, NotFoundError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import { createDogsService } from '../../src/modules/dogs/dogs.service';
import { createReportsService } from '../../src/modules/reports/reports.service';
import { createReviewsService } from '../../src/modules/reviews/reviews.service';
import { createVisitsService } from '../../src/modules/visits/visits.service';
import {
  makeParkDetailRecord,
  mockAll,
  mockDogsRepository,
  mockRepository,
  mockReviewsRepository,
  mockStorage,
  mockVisitsRepository,
  PARK_ID,
  USER_ID,
} from '../helpers';
import type { ReportsRepository } from '../../src/modules/reports/reports.repository';

const TIMEOUT_MS = 1000;
const DOG_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const uniqueViolation = Object.assign(new Error('Failed query'), {
  cause: Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'check_ins_one_open_per_user_uq' }),
});

afterEach(() => vi.useRealTimers());

describe('DogsService', () => {
  let repo: ReturnType<typeof mockDogsRepository>;
  let service: ReturnType<typeof createDogsService>;
  beforeEach(() => {
    repo = mockDogsRepository();
    service = createDogsService({ repository: repo, storage: mockStorage().storage, timeoutMs: TIMEOUT_MS });
  });

  it('creates a dog under the limit', async () => {
    repo.countByOwner.mockResolvedValue(2);
    repo.create.mockResolvedValue({ id: DOG_ID, name: 'Freddy' });
    await expect(service.create(USER_ID, { name: 'Freddy' } as never)).resolves.toMatchObject({ name: 'Freddy' });
  });

  it('409 at the limit and nothing is written', async () => {
    repo.countByOwner.mockResolvedValue(10);
    await expect(service.create(USER_ID, { name: 'X' } as never)).rejects.toBeInstanceOf(ConflictError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('404 for update/remove of a dog that is missing or not owned (null/false)', async () => {
    repo.update.mockResolvedValue(null);
    repo.remove.mockResolvedValue(false);
    await expect(service.update(USER_ID, DOG_ID, { name: 'Y' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.remove(USER_ID, DOG_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('times out when the database hangs', async () => {
    vi.useFakeTimers();
    repo.listByOwner.mockReturnValue(new Promise(() => {}));
    const result = service.list(USER_ID);
    vi.advanceTimersByTime(TIMEOUT_MS);
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe('VisitsService', () => {
  let visits: ReturnType<typeof mockVisitsRepository>;
  let parks: ReturnType<typeof mockRepository>;
  let dogs: ReturnType<typeof mockDogsRepository>;
  let service: ReturnType<typeof createVisitsService>;
  const input = { parkId: PARK_ID, dogIds: [DOG_ID], durationMinutes: 60 };

  beforeEach(() => {
    visits = mockVisitsRepository();
    parks = mockRepository();
    dogs = mockDogsRepository();
    parks.findById.mockResolvedValue(makeParkDetailRecord());
    dogs.ownedIds.mockResolvedValue([DOG_ID]);
    service = createVisitsService({ visits, parks, dogs, timeoutMs: TIMEOUT_MS });
  });

  it('checks in to a public park with own dogs', async () => {
    visits.createCheckIn.mockResolvedValue({ id: 'c1' });
    await service.checkIn(USER_ID, input);
    expect(visits.createCheckIn).toHaveBeenCalledWith({ userId: USER_ID, ...input });
  });

  it.each([
    ['missing park (null)', null],
    ['pending park', makeParkDetailRecord({ status: 'pending' })],
  ])('404 for a %s', async (_case, park) => {
    parks.findById.mockResolvedValue(park);
    await expect(service.checkIn(USER_ID, input)).rejects.toBeInstanceOf(NotFoundError);
    expect(visits.createCheckIn).not.toHaveBeenCalled();
  });

  it("404 when one of the dogs is someone else's", async () => {
    dogs.ownedIds.mockResolvedValue([]);
    await expect(service.checkIn(USER_ID, input)).rejects.toMatchObject({ key: 'errors.dogNotFound' });
    expect(visits.createCheckIn).not.toHaveBeenCalled();
  });

  it('409 when a concurrent check-in won the race (unique index)', async () => {
    visits.createCheckIn.mockRejectedValue(uniqueViolation);
    await expect(service.checkIn(USER_ID, input)).rejects.toBeInstanceOf(ConflictError);
  });

  it('propagates other database errors unchanged', async () => {
    const failure = new Error('connection lost');
    visits.createCheckIn.mockRejectedValue(failure);
    await expect(service.checkIn(USER_ID, input)).rejects.toBe(failure);
  });

  it('ending is idempotent but 404 for a foreign check-in', async () => {
    visits.endCheckIn.mockResolvedValueOnce('closed').mockResolvedValueOnce('not-found');
    await expect(service.endCheckIn(USER_ID, 'c1')).resolves.toBeUndefined();
    await expect(service.endCheckIn(USER_ID, 'c2')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('active check-in may be null', async () => {
    visits.findActive.mockResolvedValue(null);
    await expect(service.getActive(USER_ID)).resolves.toBeNull();
  });

  it('cancelling a plan that is not yours is 404', async () => {
    visits.deletePlan.mockResolvedValue(false);
    await expect(service.cancelPlan(USER_ID, 'p1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('visitors of a non-public park are 404', async () => {
    parks.findById.mockResolvedValue(null);
    await expect(service.listVisitors(PARK_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(visits.listVisitors).not.toHaveBeenCalled();
  });

  it('times out when the check-in insert hangs', async () => {
    vi.useFakeTimers();
    visits.createCheckIn.mockReturnValue(new Promise(() => {}));
    // Attach the expectation before advancing time: the timer is created only after the park and
    // dog lookups resolve, so time must advance asynchronously, and the rejection must already
    // have a handler when it fires (otherwise it is reported as unhandled).
    const assertion = expect(service.checkIn(USER_ID, input)).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    await assertion;
  });
});

describe('ReviewsService', () => {
  let reviews: ReturnType<typeof mockReviewsRepository>;
  let parks: ReturnType<typeof mockRepository>;
  let service: ReturnType<typeof createReviewsService>;
  beforeEach(() => {
    reviews = mockReviewsRepository();
    parks = mockRepository();
    parks.findById.mockResolvedValue(makeParkDetailRecord());
    service = createReviewsService({ reviews, parks, timeoutMs: TIMEOUT_MS });
  });

  it('403 without a visit, and nothing is written', async () => {
    reviews.hasVisited.mockResolvedValue(false);
    await expect(service.submit(USER_ID, PARK_ID, { rating: 5, body: null })).rejects.toBeInstanceOf(ForbiddenError);
    expect(reviews.upsert).not.toHaveBeenCalled();
  });

  it('upserts after a visit', async () => {
    reviews.hasVisited.mockResolvedValue(true);
    reviews.upsert.mockResolvedValue({ id: 'r1', rating: 4 });
    await expect(service.submit(USER_ID, PARK_ID, { rating: 4, body: null })).resolves.toMatchObject({ rating: 4 });
  });

  it('passes the viewer so blocked authors can be filtered', async () => {
    reviews.listForPark.mockResolvedValue([]);
    await service.list(PARK_ID, USER_ID);
    expect(reviews.listForPark).toHaveBeenCalledWith(PARK_ID, USER_ID, 20);
  });
});

describe('ReportsService', () => {
  it('404 for a non-public park, otherwise stores the report', async () => {
    const reports = mockAll<ReportsRepository>(['create']);
    const parks = mockRepository();
    const service = createReportsService({ reports, parks, timeoutMs: TIMEOUT_MS });

    parks.findById.mockResolvedValueOnce(null);
    await expect(service.reportPark(USER_ID, PARK_ID, { description: 'Katkine värav' })).rejects.toBeInstanceOf(NotFoundError);

    parks.findById.mockResolvedValueOnce(makeParkDetailRecord());
    reports.create.mockResolvedValue({ id: 'rep1' });
    await expect(service.reportPark(USER_ID, PARK_ID, { description: 'Katkine värav' })).resolves.toEqual({ id: 'rep1' });
  });
});
