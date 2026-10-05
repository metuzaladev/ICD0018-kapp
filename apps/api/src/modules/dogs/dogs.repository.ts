import type { Dog, DogInput, UpdateDogInput } from '@kapp/shared';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { dogPhotos, dogs } from '../../db/schema';
import type { PhotoKeys } from '../photos/photo-storage';

/**
 * A dog as stored: like the API `Dog`, but with the profile photo's object keys instead of signed
 * URLs. Signing needs the object storage, which is the service's concern, not the repository's.
 */
export type DogRecord = Omit<Dog, 'profilePhoto'> & { profilePhoto: PhotoKeys | null };

/** Data access for the owner's dogs ("Minu koerad"). Every query is scoped by owner id. */
export interface DogsRepository {
  listByOwner(ownerId: string): Promise<DogRecord[]>;
  /** null when the dog does not exist or belongs to someone else. */
  findOwned(ownerId: string, dogId: string): Promise<DogRecord | null>;
  countByOwner(ownerId: string): Promise<number>;
  create(ownerId: string, input: DogInput): Promise<DogRecord>;
  /** Returns null when the dog does not exist or belongs to someone else. */
  update(ownerId: string, dogId: string, patch: UpdateDogInput): Promise<DogRecord | null>;
  /** Returns false when nothing was deleted (missing or not owned). */
  remove(ownerId: string, dogId: string): Promise<boolean>;
  /** Of the given ids, those owned by `ownerId` — used to validate check-ins, photos and health records. */
  ownedIds(ownerId: string, dogIds: string[]): Promise<string[]>;
  /**
   * Sets (or with null clears) the profile photo. False when the dog is not the owner's or the
   * photo does not belong to this dog — checked in the same statement, so it cannot race.
   */
  setProfilePhoto(ownerId: string, dogId: string, photoId: string | null): Promise<boolean>;
}

const columns = {
  id: dogs.id,
  name: dogs.name,
  breed: dogs.breed,
  sex: dogs.sex,
  birthDate: dogs.birthDate,
  weightKg: dogs.weightKg,
  temperament: dogs.temperament,
  imageKey: dogPhotos.imageKey,
  thumbnailKey: dogPhotos.thumbnailKey,
};

type Row = Omit<DogRecord, 'weightKg' | 'profilePhoto'> & {
  weightKg: string | null;
  imageKey: string | null;
  thumbnailKey: string | null;
};

/** numeric comes back from Postgres as a string (exact decimal); the API speaks numbers. */
function toDog({ weightKg, imageKey, thumbnailKey, ...row }: Row): DogRecord {
  return {
    ...row,
    weightKg: weightKg === null ? null : Number(weightKg),
    profilePhoto: imageKey && thumbnailKey ? { imageKey, thumbnailKey } : null,
  };
}

const toNumeric = (n: number | null | undefined) => (n === undefined ? undefined : n === null ? null : n.toFixed(2));

export function createDogsRepository(db: Db): DogsRepository {
  const owned = (ownerId: string, dogId: string) => and(eq(dogs.id, dogId), eq(dogs.ownerId, ownerId));

  /** Every read goes through here so `profilePhoto` is filled the same way everywhere. */
  const selectDogs = () => db.select(columns).from(dogs).leftJoin(dogPhotos, eq(dogPhotos.id, dogs.profilePhotoId));

  async function findOwned(ownerId: string, dogId: string) {
    const [row] = await selectDogs().where(owned(ownerId, dogId)).limit(1);
    return row ? toDog(row) : null;
  }

  return {
    async listByOwner(ownerId) {
      const rows = await selectDogs().where(eq(dogs.ownerId, ownerId)).orderBy(asc(dogs.createdAt));
      return rows.map(toDog);
    },

    findOwned,

    async countByOwner(ownerId) {
      const [row] = await db.select({ n: count() }).from(dogs).where(eq(dogs.ownerId, ownerId));
      return row?.n ?? 0;
    },

    async create(ownerId, { weightKg, ...input }) {
      const [row] = await db
        .insert(dogs)
        .values({ ...input, weightKg: toNumeric(weightKg), ownerId })
        .returning({ id: dogs.id });
      if (!row) throw new Error('Insert returned no row');
      const dog = await findOwned(ownerId, row.id);
      if (!dog) throw new Error('Dog not readable after insert');
      return dog;
    },

    async update(ownerId, dogId, { weightKg, ...patch }) {
      const values = Object.fromEntries(
        Object.entries({ ...patch, weightKg: toNumeric(weightKg) }).filter(([, v]) => v !== undefined),
      );
      const updated = await db.update(dogs).set(values).where(owned(ownerId, dogId)).returning({ id: dogs.id });
      return updated.length > 0 ? findOwned(ownerId, dogId) : null;
    },

    async remove(ownerId, dogId) {
      const deleted = await db.delete(dogs).where(owned(ownerId, dogId)).returning({ id: dogs.id });
      return deleted.length > 0;
    },

    async ownedIds(ownerId, dogIds) {
      if (dogIds.length === 0) return [];
      const rows = await db
        .select({ id: dogs.id })
        .from(dogs)
        .where(and(eq(dogs.ownerId, ownerId), inArray(dogs.id, dogIds)));
      return rows.map((r) => r.id);
    },

    async setProfilePhoto(ownerId, dogId, photoId) {
      // The foreign key alone would accept another dog's photo; the exists() pins it to this dog.
      const photoBelongsToDog =
        photoId === null
          ? undefined
          : sql`exists (select 1 from dog_photos p where p.id = ${photoId} and p.dog_id = ${dogId})`;
      const updated = await db
        .update(dogs)
        .set({ profilePhotoId: photoId })
        .where(and(owned(ownerId, dogId), photoBelongsToDog))
        .returning({ id: dogs.id });
      return updated.length > 0;
    },
  };
}
