import type { Db } from '../../db/client';
import { parkReports } from '../../db/schema';

/** Hazard reports ("Märkasid probleemi?"). Moderated later; status starts as `open`. */
export interface ReportsRepository {
  create(input: { userId: string; parkId: string; description: string }): Promise<{ id: string }>;
}

export function createReportsRepository(db: Db): ReportsRepository {
  return {
    async create({ userId, parkId, description }) {
      const [row] = await db.insert(parkReports).values({ userId, parkId, description }).returning({ id: parkReports.id });
      if (!row) throw new Error('Insert returned no row');
      return row;
    },
  };
}
