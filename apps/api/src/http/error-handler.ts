import type { ApiError } from '@kapp/shared';
import type { FastifyError, FastifyInstance } from 'fastify';

import { TimeoutError } from '../lib/timeout';
import { HttpError } from './errors';

/**
 * Maps every thrown error to `{ error: true, message }` with the right HTTP status.
 *
 * Why one central handler: routes stay free of try/catch, the response shape can never drift,
 * and internal details (SQL, stack traces, file paths) are guaranteed not to leak — only
 * HttpError messages and the fixed texts below are ever sent to the client.
 */

/** Fastify's own request-parsing errors, translated to user-facing text. */
const FASTIFY_CLIENT_ERRORS: Record<string, { status: number; message: string }> = {
  FST_ERR_CTP_EMPTY_JSON_BODY: { status: 400, message: 'Päringu sisu puudub' },
  FST_ERR_CTP_INVALID_JSON_BODY: { status: 400, message: 'Päringu sisu ei ole korrektne JSON' },
  FST_ERR_CTP_INVALID_MEDIA_TYPE: { status: 415, message: 'Toetatud on ainult application/json' },
  FST_ERR_CTP_BODY_TOO_LARGE: { status: 413, message: 'Päringu sisu on liiga suur' },
};

/** Postgres SQLSTATE / Node socket codes that mean "database unavailable or too slow", not "bug". */
const UNAVAILABLE_CODES = new Set([
  '57014', // query_canceled (statement_timeout)
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
]);

function isUnavailable(error: unknown): boolean {
  // Drizzle wraps driver errors in `cause`; walk the chain a few levels.
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth++) {
    if (current instanceof TimeoutError) return true;
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && UNAVAILABLE_CODES.has(code)) return true;
    if (current instanceof Error && /connection terminated|timeout exceeded when trying to connect/i.test(current.message)) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function toErrorResponse(error: unknown): { status: number; body: ApiError } {
  if (error instanceof HttpError) {
    return { status: error.statusCode, body: error.toResponse() };
  }
  if (isUnavailable(error)) {
    return { status: 503, body: { error: true, message: 'Teenus ei vasta, proovi hetke pärast uuesti' } };
  }
  // `throw null` / `throw 'text'` are legal JavaScript; treat them as unknown bugs, never crash here.
  const fastifyError: Partial<FastifyError> = typeof error === 'object' && error !== null ? error : {};
  const known = fastifyError.code ? FASTIFY_CLIENT_ERRORS[fastifyError.code] : undefined;
  if (known) {
    return { status: known.status, body: { error: true, message: known.message } };
  }
  const status = fastifyError.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return { status, body: { error: true, message: 'Vigane päring' } };
  }
  return { status: 500, body: { error: true, message: 'Serveri viga, proovi hiljem uuesti' } };
}

export function registerErrorHandling(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const { status, body } = toErrorResponse(error);
    if (status >= 500) {
      request.log.error({ err: error }, 'request failed');
    } else {
      request.log.info({ status, message: body.message }, 'request rejected');
    }
    return reply.code(status).send(body);
  });

  app.setNotFoundHandler((_request, reply) => {
    const body: ApiError = { error: true, message: 'Sellist aadressi pole' };
    return reply.code(404).send(body);
  });
}
