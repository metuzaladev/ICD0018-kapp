import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_DOG, REMINDER_WINDOW_DAYS, type HealthRecord } from '@kapp/shared';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BadRequestError, ConflictError, NotFoundError, ServiceUnavailableError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import type { DogRecord } from '../../src/modules/dogs/dogs.repository';
import { createDogsService } from '../../src/modules/dogs/dogs.service';
import { createHealthRecordsService } from '../../src/modules/health-records/health-records.service';
import { createPhotosService } from '../../src/modules/photos/photos.service';
import { ObjectTooLargeError } from '../../src/storage/object-storage';
import {
  makeCameraJpeg,
  mockDogsRepository,
  mockHealthRecordsRepository,
  mockPhotosRepository,
  mockStorage,
  USER_ID,
} from '../helpers';

const TIMEOUT_MS = 1000;
const DOG_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const PHOTO_ID = '1c6b1c3e-0f7a-4c4e-9a59-3f4f0c1d2e3f';
const RECORD_ID = '6f1b2a3c-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const UPLOAD_KEY = `uploads/${USER_ID}/0b7e6a2c-1d3f-4e5a-8b9c-0d1e2f3a4b5c`;
const FOREIGN_KEY = 'uploads/someone_else/0b7e6a2c-1d3f-4e5a-8b9c-0d1e2f3a4b5c';

/** What the S3 SDK throws when MinIO/R2 is unreachable. */
const storageDown = new Error('connect ECONNREFUSED 127.0.0.1:9000');

function makeDogRecord(overrides: Partial<DogRecord> = {}): DogRecord {
  return { id: DOG_ID, name: 'Freddy', breed: null, sex: null, birthDate: null, weightKg: null, temperament: null, profilePhoto: null, ...overrides };
}

afterEach(() => vi.useRealTimers());

describe('PhotosService', () => {
  let photos: ReturnType<typeof mockPhotosRepository>;
  let dogs: ReturnType<typeof mockDogsRepository>;
  let store: ReturnType<typeof mockStorage>;
  let service: ReturnType<typeof createPhotosService>;

  beforeEach(() => {
    photos = mockPhotosRepository();
    dogs = mockDogsRepository();
    store = mockStorage();
    dogs.ownedIds.mockResolvedValue([DOG_ID]);
    photos.countByDog.mockResolvedValue(0);
    photos.create.mockImplementation(async (input) => ({ ...input, createdAt: new Date('2026-10-01T10:00:00Z') }));
    service = createPhotosService({ photos, dogs, storage: store.storage, timeoutMs: TIMEOUT_MS });
  });

  const upload = async (body: Buffer, key = UPLOAD_KEY) => store.objects.set(key, { body, contentType: 'image/jpeg' });

  describe('createUpload', () => {
    it('signs a PUT for a key under the user’s own prefix, valid 10 minutes', async () => {
      const result = await service.createUpload(USER_ID, DOG_ID, { contentType: 'image/jpeg', byteSize: 1234 });
      expect(result.uploadKey).toMatch(new RegExp(`^uploads/${USER_ID}/[0-9a-f-]{36}$`));
      expect(result.headers).toEqual({ 'Content-Type': 'image/jpeg' });
      expect(store.storage.createUploadUrl).toHaveBeenCalledWith(result.uploadKey, { contentType: 'image/jpeg', byteSize: 1234 }, 600);
      expect(Date.parse(result.expiresAt) - Date.now()).toBeGreaterThan(590_000);
    });

    it("404 for someone else's (or a missing) dog — storage is never asked", async () => {
      dogs.ownedIds.mockResolvedValue([]);
      await expect(service.createUpload(USER_ID, DOG_ID, { contentType: 'image/png', byteSize: 1 })).rejects.toMatchObject({ key: 'errors.dogNotFound' });
      expect(store.storage.createUploadUrl).not.toHaveBeenCalled();
    });

    it('409 when the dog already has the maximum number of photos', async () => {
      photos.countByDog.mockResolvedValue(MAX_PHOTOS_PER_DOG);
      await expect(service.createUpload(USER_ID, DOG_ID, { contentType: 'image/png', byteSize: 1 })).rejects.toBeInstanceOf(ConflictError);
    });

    it('503 with a safe message when the storage fails', async () => {
      store.storage.createUploadUrl.mockRejectedValue(storageDown);
      const error = await service.createUpload(USER_ID, DOG_ID, { contentType: 'image/png', byteSize: 1 }).catch((e) => e);
      expect(error).toBeInstanceOf(ServiceUnavailableError);
      expect(error.localize('et')).toBe('Pildihoidla ei vasta, proovi hetke pärast uuesti');
      expect(error.message).toBe('Photo storage is not responding, please try again in a moment'); // English for the log
      expect(error.cause).toBe(storageDown); // kept for the server log only
    });
  });

  describe('addPhoto', () => {
    it('processes the upload: two WebP objects without EXIF, a row, raw upload deleted, signed URLs', async () => {
      await upload(await makeCameraJpeg(2000, 1500));
      const photo = await service.addPhoto(USER_ID, DOG_ID, { uploadKey: UPLOAD_KEY, caption: 'Rannas' });

      const created = photos.create.mock.calls[0]![0];
      expect(created).toMatchObject({ dogId: DOG_ID, caption: 'Rannas' });
      expect(created.imageKey).toBe(`dogs/${DOG_ID}/${created.id}/full.webp`);
      expect(created.thumbnailKey).toBe(`dogs/${DOG_ID}/${created.id}/thumb.webp`);
      const full = store.objects.get(created.imageKey)!;
      expect(full.contentType).toBe('image/webp');
      expect((await sharp(full.body).metadata()).exif).toBeUndefined();
      expect(store.objects.has(UPLOAD_KEY)).toBe(false);
      expect(photo).toMatchObject({ id: created.id, caption: 'Rannas', createdAt: '2026-10-01T10:00:00.000Z' });
      expect(photo.url).toContain('full.webp');
      expect(photo.thumbnailUrl).toContain('thumb.webp');
    });

    it("404 for another user's upload key — the object is never even looked at", async () => {
      await upload(await makeCameraJpeg(100, 100), FOREIGN_KEY);
      await expect(service.addPhoto(USER_ID, DOG_ID, { uploadKey: FOREIGN_KEY, caption: null })).rejects.toBeInstanceOf(NotFoundError);
      expect(store.storage.stat).not.toHaveBeenCalled();
      expect(store.objects.has(FOREIGN_KEY)).toBe(true);
      expect(photos.create).not.toHaveBeenCalled();
    });

    it('404 when nothing was uploaded (or the upload expired)', async () => {
      await expect(service.addPhoto(USER_ID, DOG_ID, { uploadKey: UPLOAD_KEY, caption: null })).rejects.toMatchObject({ key: 'errors.uploadNotFound' });
    });

    it("404 for someone else's dog even with an own upload", async () => {
      dogs.ownedIds.mockResolvedValue([]);
      await upload(await makeCameraJpeg(100, 100));
      await expect(service.addPhoto(USER_ID, DOG_ID, { uploadKey: UPLOAD_KEY, caption: null })).rejects.toMatchObject({ key: 'errors.dogNotFound' });
    });

    it('400 for an object above the size limit: never downloaded, raw upload deleted', async () => {
      await upload(Buffer.alloc(MAX_PHOTO_BYTES + 1));
      await expect(service.addPhoto(USER_ID, DOG_ID, { uploadKey: UPLOAD_KEY, caption: null })).rejects.toMatchObject({ key: 'errors.photoTooLarge', params: { max: 10 } });
      expect(store.storage.read).not.toHaveBeenCalled();
      expect(store.objects.has(UPLOAD_KEY)).toBe(false);
    });

    it('400 when the object grew between stat and read', async () => {
      await upload(Buffer.from('small'));
      store.storage.read.mockRejectedValue(new ObjectTooLargeError(UPLOAD_KEY, MAX_PHOTO_BYTES + 1));
      await expect(service.addPhoto(USER_ID, DOG_ID, { uploadKey: UPLOAD_KEY, caption: null })).rejects.toBeInstanceOf(BadRequestError);
    });

    it('400 for bytes that are not an image (Content-Type is not trusted); nothing stored', async () => {
      await upload(Buffer.from('<html>not a photo</html>'));
      await expect(service.addPhoto(USER_ID, DOG_ID, { uploadKey: UPLOAD_KEY, caption: null })).rejects.toMatchObject({ key: 'errors.notAnImage' });
      expect(store.storage.write).not.toHaveBeenCalled();
      expect(photos.create).not.toHaveBeenCalled();
      expect(store.objects.size).toBe(0);
    });

    it('409 at the photo limit', async () => {
      photos.countByDog.mockResolvedValue(MAX_PHOTOS_PER_DOG);
      await upload(await makeCameraJpeg(100, 100));
      await expect(service.addPhoto(USER_ID, DOG_ID, { uploadKey: UPLOAD_KEY, caption: null })).rejects.toBeInstanceOf(ConflictError);
    });

    it('503 when writing to storage fails: no row, partial objects removed', async () => {
      await upload(await makeCameraJpeg(100, 100));
      store.storage.write.mockImplementationOnce(async (key, body, type) => void store.objects.set(key, { body, contentType: type }));
      store.storage.write.mockRejectedValueOnce(storageDown);
      await expect(service.addPhoto(USER_ID, DOG_ID, { uploadKey: UPLOAD_KEY, caption: null })).rejects.toBeInstanceOf(ServiceUnavailableError);
      expect(photos.create).not.toHaveBeenCalled();
      expect([...store.objects.keys()]).toEqual([UPLOAD_KEY]); // only the raw upload is left, for a retry
    });

    it('a failing insert removes the processed objects again', async () => {
      await upload(await makeCameraJpeg(100, 100));
      const dbDown = new Error('connection terminated');
      photos.create.mockRejectedValue(dbDown);
      await expect(service.addPhoto(USER_ID, DOG_ID, { uploadKey: UPLOAD_KEY, caption: null })).rejects.toBe(dbDown);
      expect([...store.objects.keys()]).toEqual([UPLOAD_KEY]);
    });

    it('times out when the storage hangs', async () => {
      vi.useFakeTimers();
      await upload(await makeCameraJpeg(100, 100));
      store.storage.stat.mockReturnValue(new Promise(() => {}));
      // Attach the expectation first: the timer starts only after the dog/limit lookups resolve.
      const assertion = expect(service.addPhoto(USER_ID, DOG_ID, { uploadKey: UPLOAD_KEY, caption: null })).rejects.toBeInstanceOf(TimeoutError);
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
      await assertion;
    });
  });

  describe('list, remove, profile photo', () => {
    it('lists with fresh signed URLs', async () => {
      photos.listByDog.mockResolvedValue([
        { id: PHOTO_ID, imageKey: 'dogs/d/p/full.webp', thumbnailKey: 'dogs/d/p/thumb.webp', caption: null, createdAt: new Date(0) },
      ]);
      const list = await service.list(USER_ID, DOG_ID);
      expect(list).toEqual([
        {
          id: PHOTO_ID,
          caption: null,
          createdAt: '1970-01-01T00:00:00.000Z',
          url: 'https://storage.test/dogs/d/p/full.webp?signed=get',
          thumbnailUrl: 'https://storage.test/dogs/d/p/thumb.webp?signed=get',
        },
      ]);
      expect(store.storage.createDownloadUrl).toHaveBeenCalledWith('dogs/d/p/full.webp', 900);
    });

    it("list of someone else's dog is 404", async () => {
      dogs.ownedIds.mockResolvedValue([]);
      await expect(service.list(USER_ID, DOG_ID)).rejects.toBeInstanceOf(NotFoundError);
      expect(photos.listByDog).not.toHaveBeenCalled();
    });

    it('remove deletes the row, then every object of the photo', async () => {
      photos.remove.mockResolvedValue({ id: PHOTO_ID });
      await service.remove(USER_ID, DOG_ID, PHOTO_ID);
      expect(store.storage.removePrefix).toHaveBeenCalledWith(`dogs/${DOG_ID}/${PHOTO_ID}/`);
    });

    it('remove is 404 for a photo the dog does not have; a storage error after the row is gone is not fatal', async () => {
      photos.remove.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: PHOTO_ID });
      await expect(service.remove(USER_ID, DOG_ID, PHOTO_ID)).rejects.toMatchObject({ key: 'errors.photoNotFound' });
      store.storage.removePrefix.mockRejectedValue(storageDown);
      await expect(service.remove(USER_ID, DOG_ID, PHOTO_ID)).resolves.toBeUndefined();
    });

    it('sets the profile photo and returns the dog with signed URLs', async () => {
      dogs.setProfilePhoto.mockResolvedValue(true);
      dogs.findOwned.mockResolvedValue(makeDogRecord({ profilePhoto: { imageKey: 'a/full.webp', thumbnailKey: 'a/thumb.webp' } }));
      const dog = await service.setProfilePhoto(USER_ID, DOG_ID, PHOTO_ID);
      expect(dogs.setProfilePhoto).toHaveBeenCalledWith(USER_ID, DOG_ID, PHOTO_ID);
      expect(dog.profilePhoto).toEqual({
        url: 'https://storage.test/a/full.webp?signed=get',
        thumbnailUrl: 'https://storage.test/a/thumb.webp?signed=get',
      });
    });

    it('null clears the profile photo; a photo of another dog is 404', async () => {
      dogs.setProfilePhoto.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      dogs.findOwned.mockResolvedValue(makeDogRecord());
      await expect(service.setProfilePhoto(USER_ID, DOG_ID, null)).resolves.toMatchObject({ profilePhoto: null });
      await expect(service.setProfilePhoto(USER_ID, DOG_ID, PHOTO_ID)).rejects.toMatchObject({ key: 'errors.photoNotFound' });
    });
  });
});

describe('DogsService with photos', () => {
  it('fills profilePhoto with signed URLs, null when there is none', async () => {
    const repo = mockDogsRepository();
    const { storage } = mockStorage();
    repo.listByOwner.mockResolvedValue([
      makeDogRecord({ profilePhoto: { imageKey: 'x/full.webp', thumbnailKey: 'x/thumb.webp' } }),
      makeDogRecord({ id: PHOTO_ID, name: 'Muki' }),
    ]);
    const service = createDogsService({ repository: repo, storage, timeoutMs: TIMEOUT_MS });
    const [withPhoto, without] = await service.list(USER_ID);
    expect(withPhoto!.profilePhoto?.thumbnailUrl).toBe('https://storage.test/x/thumb.webp?signed=get');
    expect(without!.profilePhoto).toBeNull();
  });

  it('deleting a dog removes all its objects; a storage failure does not undo the deletion', async () => {
    const repo = mockDogsRepository();
    const { storage } = mockStorage();
    repo.remove.mockResolvedValue(true);
    const service = createDogsService({ repository: repo, storage, timeoutMs: TIMEOUT_MS });
    await service.remove(USER_ID, DOG_ID);
    expect(storage.removePrefix).toHaveBeenCalledWith(`dogs/${DOG_ID}/`);
    storage.removePrefix.mockRejectedValue(storageDown);
    await expect(service.remove(USER_ID, DOG_ID)).resolves.toBeUndefined();
  });

  it('a missing dog is 404 and storage is not touched', async () => {
    const repo = mockDogsRepository();
    const { storage } = mockStorage();
    repo.remove.mockResolvedValue(false);
    const service = createDogsService({ repository: repo, storage, timeoutMs: TIMEOUT_MS });
    await expect(service.remove(USER_ID, DOG_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(storage.removePrefix).not.toHaveBeenCalled();
  });
});

describe('HealthRecordsService', () => {
  let records: ReturnType<typeof mockHealthRecordsRepository>;
  let dogs: ReturnType<typeof mockDogsRepository>;
  let service: ReturnType<typeof createHealthRecordsService>;
  const stored: HealthRecord = {
    id: RECORD_ID,
    dogId: DOG_ID,
    kind: 'vaccination',
    title: 'Marutaud',
    date: '2026-03-01',
    nextDue: '2027-03-01',
    clinic: null,
    notes: null,
    createdAt: '2026-03-01T10:00:00.000Z',
  };

  beforeEach(() => {
    records = mockHealthRecordsRepository();
    dogs = mockDogsRepository();
    dogs.ownedIds.mockResolvedValue([DOG_ID]);
    records.findById.mockResolvedValue(stored);
    records.update.mockImplementation(async (_dog, _id, patch) => ({ ...stored, ...patch }));
    service = createHealthRecordsService({ records, dogs, timeoutMs: TIMEOUT_MS });
  });

  it.each([
    ['list', () => service.list(USER_ID, DOG_ID)],
    ['create', () => service.create(USER_ID, DOG_ID, { ...stored, clinic: null, notes: null })],
    ['update', () => service.update(USER_ID, DOG_ID, RECORD_ID, { title: 'X' })],
    ['remove', () => service.remove(USER_ID, DOG_ID, RECORD_ID)],
  ])("%s on someone else's dog is 404 and touches no record", async (_case, call) => {
    dogs.ownedIds.mockResolvedValue([]);
    await expect(call()).rejects.toMatchObject({ key: 'errors.dogNotFound' });
    for (const fn of Object.values(records)) expect(fn).not.toHaveBeenCalled();
  });

  it.each([
    ['only nextDue, before the stored date', { nextDue: '2026-02-01' }],
    ['only nextDue, equal to the stored date', { nextDue: '2026-03-01' }],
    ['only date, after the stored nextDue', { date: '2027-04-01' }],
  ])('PATCH %s is 400 and nothing is written', async (_case, patch) => {
    await expect(service.update(USER_ID, DOG_ID, RECORD_ID, patch)).rejects.toMatchObject({ key: 'errors.nextDueBeforeDate' });
    expect(records.update).not.toHaveBeenCalled();
  });

  it('PATCH may clear nextDue (null) and then move the date freely', async () => {
    records.findById.mockResolvedValue({ ...stored, nextDue: null });
    await expect(service.update(USER_ID, DOG_ID, RECORD_ID, { date: '2026-09-01' })).resolves.toMatchObject({ date: '2026-09-01' });
    records.findById.mockResolvedValue(stored);
    await expect(service.update(USER_ID, DOG_ID, RECORD_ID, { nextDue: null })).resolves.toMatchObject({ nextDue: null });
  });

  it('PATCH of a missing record is 404', async () => {
    records.findById.mockResolvedValue(null);
    await expect(service.update(USER_ID, DOG_ID, RECORD_ID, { title: 'X' })).rejects.toMatchObject({ key: 'errors.healthRecordNotFound' });
  });

  it('a concurrent change caught by the CHECK constraint is 400, other errors pass through', async () => {
    const checkViolation = Object.assign(new Error('Failed query'), {
      cause: Object.assign(new Error('violates check'), { code: '23514', constraint: 'health_records_next_due_after_date' }),
    });
    records.update.mockRejectedValueOnce(checkViolation);
    await expect(service.update(USER_ID, DOG_ID, RECORD_ID, { title: 'X' })).rejects.toBeInstanceOf(BadRequestError);
    const other = new Error('boom');
    records.update.mockRejectedValueOnce(other);
    await expect(service.update(USER_ID, DOG_ID, RECORD_ID, { title: 'X' })).rejects.toBe(other);
  });

  it('remove of a missing record is 404', async () => {
    records.remove.mockResolvedValue(false);
    await expect(service.remove(USER_ID, DOG_ID, RECORD_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('reminders use the shared window', async () => {
    records.findReminders.mockResolvedValue([]);
    await service.reminders(USER_ID);
    expect(records.findReminders).toHaveBeenCalledWith(USER_ID, REMINDER_WINDOW_DAYS);
  });

  it('times out when the database hangs', async () => {
    vi.useFakeTimers();
    records.listByDog.mockReturnValue(new Promise(() => {}));
    const assertion = expect(service.list(USER_ID, DOG_ID)).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    await assertion;
  });
});
