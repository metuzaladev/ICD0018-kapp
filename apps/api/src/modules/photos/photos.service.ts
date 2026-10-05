import { randomUUID } from 'node:crypto';

import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_DOG,
  type AddDogPhotoInput,
  type CreatePhotoUploadInput,
  type Dog,
  type DogPhoto,
  type PhotoUpload,
} from '@kapp/shared';

import { BadRequestError, ConflictError, NotFoundError } from '../../http/errors';
import { withTimeout } from '../../lib/timeout';
import { ObjectTooLargeError, type ObjectStorage } from '../../storage/object-storage';
import type { DogsRepository } from '../dogs/dogs.repository';
import { toApiDog } from '../dogs/dogs.service';
import { InvalidImageError, processPhoto } from './photo-image';
import {
  bestEffort,
  newUploadKey,
  photoKeys,
  photoPrefix,
  signPhoto,
  storageCall,
  UPLOAD_URL_TTL_SECONDS,
  uploadPrefix,
} from './photo-storage';
import type { PhotoRecord, PhotosRepository } from './photos.repository';

/**
 * Photos of the signed-in user's dogs. Images never pass through the API body: the client gets a
 * presigned PUT, uploads directly to storage, then asks the API to process the upload.
 */
export interface PhotosService {
  createUpload(ownerId: string, dogId: string, input: CreatePhotoUploadInput): Promise<PhotoUpload>;
  addPhoto(ownerId: string, dogId: string, input: AddDogPhotoInput): Promise<DogPhoto>;
  list(ownerId: string, dogId: string): Promise<DogPhoto[]>;
  remove(ownerId: string, dogId: string, photoId: string): Promise<void>;
  setProfilePhoto(ownerId: string, dogId: string, photoId: string | null): Promise<Dog>;
}

const DOG_NOT_FOUND = 'Koera ei leitud';
const PHOTO_NOT_FOUND = 'Fotot ei leitud';
/** Same text for "expired", "never uploaded" and "someone else's key" — nothing to enumerate. */
const UPLOAD_NOT_FOUND = 'Üleslaaditud pilti ei leitud, proovi uuesti';
const TOO_LARGE = `Pilt võib olla kuni ${MAX_PHOTO_BYTES / 1024 / 1024} MB`;
const NOT_AN_IMAGE = 'Faili ei saanud pildina lugeda, proovi JPEG- või PNG-pildiga';
const LIMIT_REACHED = `Kuni ${MAX_PHOTOS_PER_DOG} fotot koera kohta`;

export function createPhotosService({
  photos,
  dogs,
  storage,
  timeoutMs,
}: {
  photos: PhotosRepository;
  dogs: Pick<DogsRepository, 'ownedIds' | 'findOwned' | 'setProfilePhoto'>;
  storage: ObjectStorage;
  timeoutMs: number;
}): PhotosService {
  const t = <T>(p: Promise<T>, label: string) => withTimeout(p, timeoutMs, label);
  const s = <T>(p: Promise<T>, label: string) => storageCall(p, timeoutMs, label);

  async function requireOwnedDog(ownerId: string, dogId: string) {
    // Same 404 for a missing dog and someone else's dog (no id enumeration).
    const owned = await t(dogs.ownedIds(ownerId, [dogId]), 'dogs.ownedIds');
    if (owned.length === 0) throw new NotFoundError(DOG_NOT_FOUND);
  }

  // Checked before the upload URL and again before saving. Not race-proof (like the dog limit):
  // it bounds storage per dog against abuse, an exact 50 is not a business rule.
  async function requireRoom(dogId: string) {
    if ((await t(photos.countByDog(dogId), 'photos.count')) >= MAX_PHOTOS_PER_DOG) throw new ConflictError(LIMIT_REACHED);
  }

  async function toDogPhoto(record: PhotoRecord): Promise<DogPhoto> {
    const urls = await s(signPhoto(storage, record), 'storage.sign');
    return { id: record.id, caption: record.caption, createdAt: record.createdAt.toISOString(), ...urls };
  }

  /** Reads the raw upload, enforcing the size limit on what is actually stored, not on what was declared. */
  async function readUpload(key: string): Promise<Buffer> {
    const info = await s(storage.stat(key), 'storage.stat');
    if (!info) throw new NotFoundError(UPLOAD_NOT_FOUND);
    try {
      if (info.byteSize > MAX_PHOTO_BYTES) throw new ObjectTooLargeError(key, info.byteSize);
      const bytes = await s(storage.read(key, MAX_PHOTO_BYTES), 'storage.read');
      if (!bytes) throw new NotFoundError(UPLOAD_NOT_FOUND);
      return bytes;
    } catch (error) {
      if (!(error instanceof ObjectTooLargeError)) throw error;
      await bestEffort(s(storage.remove([key]), 'storage.removeUpload'));
      throw new BadRequestError(TOO_LARGE);
    }
  }

  return {
    async createUpload(ownerId, dogId, input) {
      await requireOwnedDog(ownerId, dogId);
      await requireRoom(dogId);
      const uploadKey = newUploadKey(ownerId);
      const signed = await s(storage.createUploadUrl(uploadKey, input, UPLOAD_URL_TTL_SECONDS), 'storage.presignPut');
      return { uploadKey, url: signed.url, headers: signed.headers, expiresAt: signed.expiresAt.toISOString() };
    },

    async addPhoto(ownerId, dogId, { uploadKey, caption }) {
      // Upload keys are scoped to the user who asked for them. Someone else's key is "not found",
      // so one user can never turn another user's upload into their dog's photo.
      if (!uploadKey.startsWith(uploadPrefix(ownerId))) throw new NotFoundError(UPLOAD_NOT_FOUND);
      await requireOwnedDog(ownerId, dogId);
      await requireRoom(dogId);

      const raw = await readUpload(uploadKey);
      let processed;
      try {
        processed = await t(processPhoto(raw), 'photos.process');
      } catch (error) {
        if (!(error instanceof InvalidImageError)) throw error;
        await bestEffort(s(storage.remove([uploadKey]), 'storage.removeUpload'));
        throw new BadRequestError(NOT_AN_IMAGE);
      }

      // Objects first, row last: if anything fails there is no database row pointing at missing
      // objects, and the objects written so far are removed again.
      const id = randomUUID();
      const keys = photoKeys(dogId, id);
      let record: PhotoRecord;
      try {
        await s(
          Promise.all([
            storage.write(keys.imageKey, processed.full, 'image/webp'),
            storage.write(keys.thumbnailKey, processed.thumbnail, 'image/webp'),
          ]),
          'storage.write',
        );
        record = await t(photos.create({ id, dogId, ...keys, caption }), 'photos.create');
      } catch (error) {
        await bestEffort(s(storage.removePrefix(photoPrefix(dogId, id)), 'storage.rollback'));
        throw error;
      }
      // The raw upload may still contain EXIF/GPS; it must not outlive processing.
      await bestEffort(s(storage.remove([uploadKey]), 'storage.removeUpload'));
      return toDogPhoto(record);
    },

    async list(ownerId, dogId) {
      await requireOwnedDog(ownerId, dogId);
      const records = await t(photos.listByDog(dogId), 'photos.list');
      return Promise.all(records.map(toDogPhoto));
    },

    async remove(ownerId, dogId, photoId) {
      await requireOwnedDog(ownerId, dogId);
      const removed = await t(photos.remove(dogId, photoId), 'photos.remove');
      if (!removed) throw new NotFoundError(PHOTO_NOT_FOUND);
      // Row first (source of truth, profile photo cleared by the FK), then objects; see dogs.remove.
      await bestEffort(s(storage.removePrefix(photoPrefix(dogId, photoId)), 'storage.removePhoto'));
    },

    async setProfilePhoto(ownerId, dogId, photoId) {
      await requireOwnedDog(ownerId, dogId);
      if (!(await t(dogs.setProfilePhoto(ownerId, dogId, photoId), 'dogs.setProfilePhoto'))) {
        throw new NotFoundError(PHOTO_NOT_FOUND);
      }
      const dog = await t(dogs.findOwned(ownerId, dogId), 'dogs.findOwned');
      if (!dog) throw new NotFoundError(DOG_NOT_FOUND); // deleted in between
      return toApiDog(storage, dog, timeoutMs);
    },
  };
}
