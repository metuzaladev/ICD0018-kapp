import type { FastifyPluginAsync } from 'fastify';

import { translateAuthError } from './auth-errors';

export interface AuthRoutesOptions {
  /** Better Auth's fetch handler (`auth.handler`). Injected so the proxy can be tested with a fake. */
  handler: (request: Request) => Promise<Response>;
}

/**
 * Forwards /api/v1/auth/* to Better Auth (it speaks the Fetch API, Fastify speaks Node).
 * Registered as an encapsulated plugin, so the extra form parser below applies only here.
 */
export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, { handler }) => {
  // Sign in with Apple's web callback posts application/x-www-form-urlencoded; pass it through raw.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  app.route({
    method: ['GET', 'POST'],
    url: '/auth/*',
    // Stricter than the global limit: protects password guessing even if Better Auth's limiter is off.
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    async handler(request, reply) {
      const url = new URL(request.url, `${request.protocol}://${request.host}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value === undefined) continue;
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const body =
        request.body === undefined || request.body === null
          ? undefined
          : typeof request.body === 'string'
            ? request.body
            : JSON.stringify(request.body);

      const response = await handler(new Request(url, { method: request.method, headers, body }));

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        // set-cookie must stay separate headers; forEach would join them with ", " and break cookies.
        if (key !== 'set-cookie' && key !== 'content-length') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header('set-cookie', cookies);

      const text = await response.text();
      if (response.status >= 400) {
        let parsed: unknown = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          // non-JSON error page — translated by status below
        }
        reply.header('content-type', 'application/json; charset=utf-8');
        return reply.send(translateAuthError(response.status, parsed));
      }
      return reply.send(text || null);
    },
  });
};
