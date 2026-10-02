import type { FastifyPluginAsync } from 'fastify';

export interface HealthRoutesOptions {
  /** Resolves true when the database answers. Injected so tests do not need Postgres. */
  checkDatabase: () => Promise<boolean>;
}

/**
 * GET /health — for load balancers and uptime checks, therefore outside /api/v1 and not
 * rate limited. Always 200 while the process runs; `database` tells whether it is usable.
 * Logged only at warn: the container healthcheck calls it every 15 s and would drown real logs.
 */
export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, { checkDatabase }) => {
  app.get('/health', { config: { rateLimit: false }, logLevel: 'warn' }, async () => {
    const up = await checkDatabase().catch(() => false);
    return { status: 'ok', database: up ? 'up' : 'down' };
  });
};
