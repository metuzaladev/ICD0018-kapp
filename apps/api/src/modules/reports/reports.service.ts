import type { ParkReportInput } from '@kapp/shared';

import { NotFoundError } from '../../http/errors';
import { withTimeout } from '../../lib/timeout';
import type { ParksRepository } from '../parks/parks.repository';
import { isPublic } from '../parks/parks.service';
import type { ReportsRepository } from './reports.repository';

export interface ReportsService {
  reportPark(userId: string, parkId: string, input: ParkReportInput): Promise<{ id: string }>;
}

export function createReportsService({
  reports,
  parks,
  timeoutMs,
}: {
  reports: ReportsRepository;
  parks: Pick<ParksRepository, 'findById'>;
  timeoutMs: number;
}): ReportsService {
  return {
    async reportPark(userId, parkId, { description }) {
      if (!isPublic(await withTimeout(parks.findById(parkId), timeoutMs, 'parks.findById'))) {
        throw new NotFoundError('errors.parkNotFound');
      }
      return withTimeout(reports.create({ userId, parkId, description }), timeoutMs, 'reports.create');
    },
  };
}
