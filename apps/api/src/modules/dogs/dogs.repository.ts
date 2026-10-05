import type { Dog, DogInput, UpdateDogInput } from '@kapp/shared';
import { and, asc, count, eq, inArray } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { dogs } from '../../db/schema';

/** Data access for the owner's dogs ("Minu koerad"). Every query is scoped by owner id. */
export interface DogsRepository {
  listByOwner(ownerId: string): Promise<Dog[]>;
  countByOwner(ownerId: string): Promise<number>;
  create(ownerId: string, input: DogInput): Promise<Dog>;
  /** Returns null when the dog does not exist or belongs to someone else. */
  update(ownerId: string, dogId: string, patch: UpdateDogInput): Promise<Dog | null>;
  /** Returns false when nothing was deleted (missing or not owned). */
  remove(ownerId: string, dogId: string): Promise<boolean>;
  /** Of the given ids, those owned by `ownerId` — used to validate check-ins. */
  ownedIds(ownerId: string, dogIds: string[]): Promise<string[]>;
}

const columns = {
  id: dogs.id,
  name: dogs.name,
  breed: dogs.breed,
  sex: dogs.sex,
  birthDate: dogs.birthDate,
  weightKg: dogs.weightKg,
  temperament: dogs.temperament,
};

/** numeric comes back from Postgres as a string (exact decimal); the API speaks numbers. */
function toDog(row: Omit<Dog, 'weightKg'> & { weightKg: string | null }): Dog {
  return { ...row, weightKg: row.weightKg === null ? null : Number(row.weightKg) };
}

const toNumeric = (n: number | null | undefined) => (n === undefined ? undefined : n === null ? null : n.toFixed(2));

export function createDogsRepository(db: Db): DogsRepository {
  return {
    async listByOwner(ownerId) {
      const rows = await db.select(columns).from(dogs).where(eq(dogs.ownerId, ownerId)).orderBy(asc(dogs.createdAt));
      return rows.map(toDog);
    },

    async countByOwner(ownerId) {
      const [row] = await db.select({ n: count() }).from(dogs).where(eq(dogs.ownerId, ownerId));
      return row?.n ?? 0;
    },

    async create(ownerId, { weightKg, ...input }) {
      const [row] = await db
        .insert(dogs)
        .values({ ...input, weightKg: toNumeric(weightKg), ownerId })
        .returning(columns);
      if (!row) throw new Error('Insert returned no row');
      return toDog(row);
    },

    async update(ownerId, dogId, { weightKg, ...patch }) {
      const values = Object.fromEntries(
        Object.entries({ ...patch, weightKg: toNumeric(weightKg) }).filter(([, v]) => v !== undefined),
      );
      const [row] = await db
        .update(dogs)
        .set(values)
        .where(and(eq(dogs.id, dogId), eq(dogs.ownerId, ownerId)))
        .returning(columns);
      return row ? toDog(row) : null;
    },

    async remove(ownerId, dogId) {
      const deleted = await db
        .delete(dogs)
        .where(and(eq(dogs.id, dogId), eq(dogs.ownerId, ownerId)))
        .returning({ id: dogs.id });
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
  };
}
