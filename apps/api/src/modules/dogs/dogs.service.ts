import { MAX_DOGS_PER_USER, type Dog, type DogInput, type UpdateDogInput } from '@kapp/shared';

import { ConflictError, NotFoundError } from '../../http/errors';
import { withTimeout } from '../../lib/timeout';
import type { DogsRepository } from './dogs.repository';

/** The signed-in user's own dogs. Other users' dogs are only ever seen through visits. */
export interface DogsService {
  list(ownerId: string): Promise<Dog[]>;
  create(ownerId: string, input: DogInput): Promise<Dog>;
  update(ownerId: string, dogId: string, patch: UpdateDogInput): Promise<Dog>;
  remove(ownerId: string, dogId: string): Promise<void>;
}

export function createDogsService({ repository, timeoutMs }: { repository: DogsRepository; timeoutMs: number }): DogsService {
  return {
    list: (ownerId) => withTimeout(repository.listByOwner(ownerId), timeoutMs, 'dogs.list'),

    async create(ownerId, input) {
      // Not race-proof (two parallel requests could both pass), but the limit protects against
      // abuse, not against a user who adds their 11th dog in the same millisecond.
      const existing = await withTimeout(repository.countByOwner(ownerId), timeoutMs, 'dogs.count');
      if (existing >= MAX_DOGS_PER_USER) throw new ConflictError(`Kuni ${MAX_DOGS_PER_USER} koera kasutaja kohta`);
      return withTimeout(repository.create(ownerId, input), timeoutMs, 'dogs.create');
    },

    async update(ownerId, dogId, patch) {
      const dog = await withTimeout(repository.update(ownerId, dogId, patch), timeoutMs, 'dogs.update');
      // Same 404 for "missing" and "someone else's" — never confirm that another user's dog id exists.
      if (!dog) throw new NotFoundError('Koera ei leitud');
      return dog;
    },

    async remove(ownerId, dogId) {
      const removed = await withTimeout(repository.remove(ownerId, dogId), timeoutMs, 'dogs.remove');
      if (!removed) throw new NotFoundError('Koera ei leitud');
    },
  };
}
