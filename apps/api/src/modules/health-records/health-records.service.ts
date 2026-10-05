import {
  REMINDER_WINDOW_DAYS,
  type HealthRecord,
  type HealthRecordInput,
  type HealthReminder,
  type UpdateHealthRecordInput,
} from '@kapp/shared';

import { BadRequestError, NotFoundError } from '../../http/errors';
import { isCheckViolation } from '../../lib/db-errors';
import { withTimeout } from '../../lib/timeout';
import type { DogsRepository } from '../dogs/dogs.repository';
import type { HealthRecordsRepository } from './health-records.repository';

/**
 * Vaccinations and vet visits of the user's own dogs. Private to the owner: no other endpoint or
 * user ever sees them, which is why every method starts from the owner id.
 */
export interface HealthRecordsService {
  list(ownerId: string, dogId: string): Promise<HealthRecord[]>;
  create(ownerId: string, dogId: string, input: HealthRecordInput): Promise<HealthRecord>;
  update(ownerId: string, dogId: string, recordId: string, patch: UpdateHealthRecordInput): Promise<HealthRecord>;
  remove(ownerId: string, dogId: string, recordId: string): Promise<void>;
  reminders(ownerId: string): Promise<HealthReminder[]>;
}

const RECORD_NOT_FOUND = 'errors.healthRecordNotFound';
/** Same wording as the shared schema's refine, so device and server show the same text. */
const NEXT_DUE_BEFORE_DATE = 'errors.nextDueBeforeDate';

export function createHealthRecordsService({
  records,
  dogs,
  timeoutMs,
}: {
  records: HealthRecordsRepository;
  dogs: Pick<DogsRepository, 'ownedIds'>;
  timeoutMs: number;
}): HealthRecordsService {
  const t = <T>(p: Promise<T>, label: string) => withTimeout(p, timeoutMs, label);

  async function requireOwnedDog(ownerId: string, dogId: string) {
    // Same 404 for a missing dog and someone else's dog (no id enumeration).
    if ((await t(dogs.ownedIds(ownerId, [dogId]), 'dogs.ownedIds')).length === 0) throw new NotFoundError('errors.dogNotFound');
  }

  return {
    async list(ownerId, dogId) {
      await requireOwnedDog(ownerId, dogId);
      return t(records.listByDog(dogId), 'health.list');
    },

    async create(ownerId, dogId, input) {
      await requireOwnedDog(ownerId, dogId);
      return t(records.create(dogId, input), 'health.create');
    },

    async update(ownerId, dogId, recordId, patch) {
      await requireOwnedDog(ownerId, dogId);
      const existing = await t(records.findById(dogId, recordId), 'health.find');
      if (!existing) throw new NotFoundError(RECORD_NOT_FOUND);
      // The schema can only compare fields within one request; a PATCH of just `date` or just
      // `nextDue` is checked here against the stored other half.
      const date = patch.date ?? existing.date;
      const nextDue = patch.nextDue === undefined ? existing.nextDue : patch.nextDue;
      if (nextDue !== null && nextDue <= date) throw new BadRequestError(NEXT_DUE_BEFORE_DATE);
      try {
        const updated = await t(records.update(dogId, recordId, patch), 'health.update');
        if (!updated) throw new NotFoundError(RECORD_NOT_FOUND);
        return updated;
      } catch (error) {
        // A concurrent PATCH changed the other half in between: the CHECK constraint decides.
        if (isCheckViolation(error, 'health_records_next_due_after_date')) throw new BadRequestError(NEXT_DUE_BEFORE_DATE);
        throw error;
      }
    },

    async remove(ownerId, dogId, recordId) {
      await requireOwnedDog(ownerId, dogId);
      if (!(await t(records.remove(dogId, recordId), 'health.remove'))) throw new NotFoundError(RECORD_NOT_FOUND);
    },

    reminders: (ownerId) => t(records.findReminders(ownerId, REMINDER_WINDOW_DAYS), 'health.reminders'),
  };
}
