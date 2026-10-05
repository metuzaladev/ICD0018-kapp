import type { ApiError } from '@kapp/shared';

/**
 * Errors that are safe to send to the client.
 *
 * Why classes instead of `reply.code(...).send(...)` in every route: routes and services just
 * `throw`, and one error handler (error-handler.ts) turns everything into the same JSON shape.
 * Anything that is NOT an HttpError is treated as a bug and its details never leave the server.
 */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }

  toResponse(): ApiError {
    return { error: true, message: this.message };
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Vigane päring') {
    super(400, message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Palun logi sisse') {
    super(401, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Sul pole selleks õigust') {
    super(403, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Ei leitud') {
    super(404, message);
  }
}

/** The request is valid but clashes with current state (e.g. a concurrent duplicate). */
export class ConflictError extends HttpError {
  constructor(message = 'Andmed muutusid vahepeal, proovi uuesti') {
    super(409, message);
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(message = 'Liiga palju päringuid, proovi hetke pärast uuesti') {
    super(429, message);
  }
}

/** Downstream dependency (database, storage, push service) is slow or unreachable. */
export class ServiceUnavailableError extends HttpError {
  constructor(message = 'Teenus ei vasta, proovi hetke pärast uuesti') {
    super(503, message);
  }
}
