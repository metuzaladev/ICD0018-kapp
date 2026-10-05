import { MAX_DOGS_PER_USER, type Dog, type DogInput, type UpdateDogInput } from '@kapp/shared';

import { ConflictError, NotFoundError } from '../../http/errors';
import { withTimeout } from '../../lib/timeout';
import type { ObjectStorage } from '../../storage/object-storage';
import { bestEffort, dogPrefix, signPhoto, storageCall } from '../photos/photo-storage';
import type { DogRecord, DogsRepository } from './dogs.repository';

/** The signed-in user's own dogs. Other users' dogs are only ever seen through visits. */
export interface DogsService {
  list(ownerId: string): Promise<Dog[]>;
  create(ownerId: string, input: DogInput): Promise<Dog>;
  update(ownerId: string, dogId: string, patch: UpdateDogInput): Promise<Dog>;
  remove(ownerId: string, dogId: string): Promise<void>;
}

/** Turns stored keys into the API shape; the profile photo gets fresh signed URLs (private bucket). */
export async function toApiDog(storage: ObjectStorage, { profilePhoto, ...dog }: DogRecord, timeoutMs: number): Promise<Dog> {
  return {
    ...dog,
    profilePhoto: profilePhoto ? await storageCall(signPhoto(storage, profilePhoto), timeoutMs, 'storage.sign') : null,
  };
}

export function createDogsService({
  repository,
  storage,
  timeoutMs,
}: {
  repository: DogsRepository;
  storage: ObjectStorage;
  timeoutMs: number;
}): DogsService {
  const toDog = (record: DogRecord) => toApiDog(storage, record, timeoutMs);

  return {
    async list(ownerId) {
      const records = await withTimeout(repository.listByOwner(ownerId), timeoutMs, 'dogs.list');
      return Promise.all(records.map(toDog));
    },

    async create(ownerId, input) {
      // Not race-proof (two parallel requests could both pass), but the limit protects against
      // abuse, not against a user who adds their 11th dog in the same millisecond.
      const existing = await withTimeout(repository.countByOwner(ownerId), timeoutMs, 'dogs.count');
      if (existing >= MAX_DOGS_PER_USER) throw new ConflictError('errors.dogLimit', { max: MAX_DOGS_PER_USER });
      return toDog(await withTimeout(repository.create(ownerId, input), timeoutMs, 'dogs.create'));
    },

    async update(ownerId, dogId, patch) {
      const dog = await withTimeout(repository.update(ownerId, dogId, patch), timeoutMs, 'dogs.update');
      // Same 404 for "missing" and "someone else's" — never confirm that another user's dog id exists.
      if (!dog) throw new NotFoundError('errors.dogNotFound');
      return toDog(dog);
    },

    async remove(ownerId, dogId) {
      const removed = await withTimeout(repository.remove(ownerId, dogId), timeoutMs, 'dogs.remove');
      if (!removed) throw new NotFoundError('errors.dogNotFound');
      // Photo rows went with the dog (on delete cascade); now the objects. The database is the
      // source of truth, so a storage hiccup must not resurrect the dog — leftovers are private
      // and unreachable, and a later prefix delete would still find them.
      await bestEffort(storageCall(storage.removePrefix(dogPrefix(dogId)), timeoutMs, 'storage.removeDog'));
    },
  };
}
