import {
  checkInIdParamsSchema,
  checkInInputSchema,
  parkIdParamsSchema,
  plannedVisitIdParamsSchema,
  plannedVisitInputSchema,
} from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { VisitsService } from './visits.service';

export interface VisitsRoutesOptions {
  service: VisitsService;
  resolveUserId: ResolveUserId;
}

/**
 * All visit routes need a session: check-ins and plans belong to a user, and the visitor list
 * contains personal data, so it is never public.
 */
export const visitsRoutes: FastifyPluginAsync<VisitsRoutesOptions> = async (app, { service, resolveUserId }) => {
  app.addHook('preHandler', requireUser(resolveUserId));

  // Check-ins ("Märgi kohalolek")
  app.post('/me/check-ins', async (request, reply) => {
    const input = parseRequest(checkInInputSchema, request.body, 'body');
    return reply.code(201).send(await service.checkIn(request.userId!, input));
  });

  // 200 with null when not in a park — "nothing active" is a normal state, not an error.
  app.get('/me/check-ins/active', async (request, reply) => {
    return reply.send(await service.getActive(request.userId!));
  });

  // An action endpoint (not DELETE): the check-in stays in history, it only gets an end time.
  app.post('/me/check-ins/:checkInId/end', async (request, reply) => {
    const { checkInId } = parseRequest(checkInIdParamsSchema, request.params, 'params');
    await service.endCheckIn(request.userId!, checkInId);
    return reply.code(204).send();
  });

  // Who is in the park now, filtered by each person's presence-sharing setting.
  app.get('/parks/:parkId/visitors', async (request) => {
    const { parkId } = parseRequest(parkIdParamsSchema, request.params, 'params');
    return service.listVisitors(parkId, request.userId!);
  });

  app.get('/me/visits', async (request) => service.history(request.userId!));

  // Planned visits ("Planeeri külastus")
  app.post('/me/planned-visits', async (request, reply) => {
    const input = parseRequest(plannedVisitInputSchema, request.body, 'body');
    return reply.code(201).send(await service.planVisit(request.userId!, input));
  });

  app.get('/me/planned-visits', async (request) => service.listPlans(request.userId!));

  app.delete('/me/planned-visits/:planId', async (request, reply) => {
    const { planId } = parseRequest(plannedVisitIdParamsSchema, request.params, 'params');
    await service.cancelPlan(request.userId!, planId);
    return reply.code(204).send();
  });
};
