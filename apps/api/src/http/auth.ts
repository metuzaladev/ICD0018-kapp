import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';

import { UnauthorizedError } from './errors';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireUser`; present on every authenticated route. */
    userId?: string;
  }
}

/**
 * Resolves the signed-in user id from a request (session cookie / bearer token), or null.
 *
 * Why injectable: Better Auth is wired in milestone M1. Until then the default resolver
 * returns null, so every protected route answers 401 — secure by default — while tests can
 * inject a fake resolver and exercise the protected logic.
 * Only the headers are needed, so the Socket.IO handshake (M5) can use the same resolver.
 */
export type ResolveUserId = (request: Pick<FastifyRequest, 'headers'>) => Promise<string | null>;

export const noAuthYet: ResolveUserId = async () => null;

export function requireUser(resolveUserId: ResolveUserId): preHandlerAsyncHookHandler {
  return async (request) => {
    const userId = await resolveUserId(request);
    if (!userId) throw new UnauthorizedError();
    request.userId = userId;
  };
}

/**
 * For public routes that show extra data to signed-in users (e.g. "is this park my favourite").
 * Never rejects for a missing session; a failing session store still surfaces as 503.
 */
export function optionalUser(resolveUserId: ResolveUserId): preHandlerAsyncHookHandler {
  return async (request) => {
    request.userId = (await resolveUserId(request)) ?? undefined;
  };
}
