import { and, count, desc, eq } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { dogPhotos } from '../../db/schema';
import type { PhotoKeys } from './photo-storage';

export interface PhotoRecord extends PhotoKeys {
  id: string;
  caption: string | null;
  createdAt: Date;
}

/**
 * Data access for dog photos. Methods are scoped by dog id; the service checks first that the dog
 * belongs to the signed-in user (dogs.ownedIds), so a photo id of another dog is simply not found.
 */
export interface PhotosRepository {
  countByDog(dogId: string): Promise<number>;
  /** Newest first. */
  listByDog(dogId: string): Promise<PhotoRecord[]>;
  create(input: PhotoKeys & { id: string; dogId: string; caption: string | null }): Promise<PhotoRecord>;
  /** Returns the deleted row (for its object keys) or null when the dog has no such photo. */
  remove(dogId: string, photoId: string): Promise<PhotoRecord | null>;
}

const columns = {
  id: dogPhotos.id,
  imageKey: dogPhotos.imageKey,
  thumbnailKey: dogPhotos.thumbnailKey,
  caption: dogPhotos.caption,
  createdAt: dogPhotos.createdAt,
};

export function createPhotosRepository(db: Db): PhotosRepository {
  return {
    async countByDog(dogId) {
      const [row] = await db.select({ n: count() }).from(dogPhotos).where(eq(dogPhotos.dogId, dogId));
      return row?.n ?? 0;
    },

    listByDog(dogId) {
      return db
        .select(columns)
        .from(dogPhotos)
        .where(eq(dogPhotos.dogId, dogId))
        .orderBy(desc(dogPhotos.createdAt), desc(dogPhotos.id));
    },

    async create(input) {
      const [row] = await db.insert(dogPhotos).values(input).returning(columns);
      if (!row) throw new Error('Insert returned no row');
      return row;
    },

    async remove(dogId, photoId) {
      // dogs.profile_photo_id is cleared by the foreign key (on delete set null).
      const [row] = await db
        .delete(dogPhotos)
        .where(and(eq(dogPhotos.id, photoId), eq(dogPhotos.dogId, dogId)))
        .returning(columns);
      return row ?? null;
    },
  };
}
