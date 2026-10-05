import { parkIdParamsSchema, parkReportInputSchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { ReportsService } from './reports.service';

export interface ReportsRoutesOptions {
  service: ReportsService;
  resolveUserId: ResolveUserId;
}

export const reportsRoutes: FastifyPluginAsync<ReportsRoutesOptions> = async (app, { service, resolveUserId }) => {
  // POST /api/v1/parks/:parkId/reports — signed-in only and tightly limited: every report is
  // manual moderation work, and anonymous reports would invite spam.
  app.post(
    '/parks/:parkId/reports',
    { preHandler: requireUser(resolveUserId), config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const { parkId } = parseRequest(parkIdParamsSchema, request.params, 'params');
      const input = parseRequest(parkReportInputSchema, request.body, 'body');
      return reply.code(201).send(await service.reportPark(request.userId!, parkId, input));
    },
  );
};
