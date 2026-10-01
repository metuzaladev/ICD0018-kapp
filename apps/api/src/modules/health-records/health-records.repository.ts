import type { HealthRecord, HealthRecordInput, HealthReminder, UpdateHealthRecordInput } from '@kapp/shared';
import { and, asc, desc, eq, isNotNull, lte, sql } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { dogs, healthRecords } from '../../db/schema';

/**
 * Data access for health records. Record methods are scoped by dog id; the service verifies first
 * that the dog is the signed-in user's. Reminders are scoped by owner in SQL.
 */
export interface HealthRecordsRepository {
  /** Newest date first. */
  listByDog(dogId: string): Promise<HealthRecord[]>;
  findById(dogId: string, recordId: string): Promise<HealthRecord | null>;
  create(dogId: string, input: HealthRecordInput): Promise<HealthRecord>;
  /** null when the dog has no such record. */
  update(dogId: string, recordId: string, patch: UpdateHealthRecordInput): Promise<HealthRecord | null>;
  remove(dogId: string, recordId: string): Promise<boolean>;
  /** Records of all the owner's dogs due within `windowDays` or overdue, soonest first. */
  findReminders(ownerId: string, windowDays: number): Promise<HealthReminder[]>;
}

const columns = {
  id: healthRecords.id,
  dogId: healthRecords.dogId,
  kind: healthRecords.kind,
  title: healthRecords.title,
  date: healthRecords.date,
  nextDue: healthRecords.nextDue,
  clinic: healthRecords.clinic,
  notes: healthRecords.notes,
  createdAt: healthRecords.createdAt,
};

const toRecord = ({ createdAt, ...row }: Omit<HealthRecord, 'createdAt'> & { createdAt: Date }): HealthRecord => ({
  ...row,
  createdAt: createdAt.toISOString(),
});

/**
 * "Today" for reminders in the users' time zone. The app is for Tallinn; using the server's UTC
 * date would mark a reminder overdue up to three hours late (or early) around midnight.
 */
const today = sql`(now() at time zone 'Europe/Tallinn')::date`;

export function createHealthRecordsRepository(db: Db): HealthRecordsRepository {
  const scoped = (dogId: string, recordId: string) => and(eq(healthRecords.id, recordId), eq(healthRecords.dogId, dogId));

  return {
    async listByDog(dogId) {
      const rows = await db
        .select(columns)
        .from(healthRecords)
        .where(eq(healthRecords.dogId, dogId))
        .orderBy(desc(healthRecords.date), desc(healthRecords.createdAt));
      return rows.map(toRecord);
    },

    async findById(dogId, recordId) {
      const [row] = await db.select(columns).from(healthRecords).where(scoped(dogId, recordId)).limit(1);
      return row ? toRecord(row) : null;
    },

    async create(dogId, input) {
      const [row] = await db
        .insert(healthRecords)
        .values({ ...input, dogId })
        .returning(columns);
      if (!row) throw new Error('Insert returned no row');
      return toRecord(row);
    },

    async update(dogId, recordId, patch) {
      const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      const [row] = await db.update(healthRecords).set(values).where(scoped(dogId, recordId)).returning(columns);
      return row ? toRecord(row) : null;
    },

    async remove(dogId, recordId) {
      const deleted = await db.delete(healthRecords).where(scoped(dogId, recordId)).returning({ id: healthRecords.id });
      return deleted.length > 0;
    },

    async findReminders(ownerId, windowDays) {
      // A record is superseded when the same dog has a later record of the same kind and title
      // (the vaccination was repeated); its old due date must not keep nagging as "overdue".
      // Outer columns are written out explicitly — see docs/06 about correlated subqueries.
      const superseded = sql`exists (
        select 1 from health_records newer
        where newer.dog_id = "health_records"."dog_id"
          and newer.kind = "health_records"."kind"
          and lower(newer.title) = lower("health_records"."title")
          and newer.date > "health_records"."date"
      )`;
      const rows = await db
        .select({
          recordId: healthRecords.id,
          dogId: dogs.id,
          dogName: dogs.name,
          kind: healthRecords.kind,
          title: healthRecords.title,
          nextDue: healthRecords.nextDue,
          overdue: sql<boolean>`${healthRecords.nextDue} < ${today}`,
        })
        .from(healthRecords)
        .innerJoin(dogs, eq(dogs.id, healthRecords.dogId))
        .where(
          and(
            eq(dogs.ownerId, ownerId),
            isNotNull(healthRecords.nextDue),
            lte(healthRecords.nextDue, sql`${today} + ${windowDays}::int`),
            sql`not ${superseded}`,
          ),
        )
        .orderBy(asc(healthRecords.nextDue), asc(dogs.name))
        .limit(100);
      return rows.map((r) => ({
        recordId: r.recordId,
        dog: { id: r.dogId, name: r.dogName },
        kind: r.kind,
        title: r.title,
        nextDue: r.nextDue!,
        overdue: Boolean(r.overdue),
      }));
    },
  };
}
