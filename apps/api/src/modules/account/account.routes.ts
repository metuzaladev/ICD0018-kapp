import { deleteAccountInputSchema, legalAcceptanceInputSchema } from '@kapp/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { AccountService } from './account.service';

/** When the request's session was created (= the last sign-in); null when unknown. */
export type ResolveSessionStart = (request: Pick<FastifyRequest, 'headers'>) => Promise<Date | null>;

export interface AccountRoutesOptions {
  service: AccountService;
  resolveUserId: ResolveUserId;
  resolveSessionStart: ResolveSessionStart;
}

/**
 * M10 account endpoints under /api/v1/me (docs/17). Deletion is DELETE /me — same resource as the
 * profile, so the URL says exactly what disappears; it is our own endpoint rather than Better Auth's
 * deleteUser so that the whole cleanup is one transaction with our own error keys and limits.
 */
export const accountRoutes: FastifyPluginAsync<AccountRoutesOptions> = async (app, { service, resolveUserId, resolveSessionStart }) => {
  app.addHook('preHandler', requireUser(resolveUserId));

  // Tight limit: the body carries a password, so this must not become a password-guessing oracle.
  app.delete('/me', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const input = parseRequest(deleteAccountInputSchema, request.body, 'body');
    // Unknown session age counts as "too old": a password-less account then has to sign in again.
    const sessionCreatedAt = (await resolveSessionStart(request)) ?? new Date(0);
    await service.deleteAccount(request.userId!, { ...input, sessionCreatedAt });
    return reply.code(204).send();
  });

  app.put('/me/legal-acceptance', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request) => {
    const input = parseRequest(legalAcceptanceInputSchema, request.body, 'body');
    return service.acceptLegal(request.userId!, input);
  });

  // The whole account in one response: a few dozen queries, so it is limited like other heavy reads.
  app.get('/me/export', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (request, reply) => {
    const data = await service.exportData(request.userId!);
    reply.header('cache-control', 'no-store');
    reply.header('content-disposition', 'attachment; filename="kapp-export.json"');
    return data;
  });

  // Each call sends an email: a handful per hour is plenty for "I did not get it".
  app.post('/me/email-verification', { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async (request, reply) => {
    await service.resendVerification(request.userId!, { headers: request.headers });
    return reply.code(202).send();
  });
};
