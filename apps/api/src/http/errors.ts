import { DEFAULT_LANGUAGE, translate, type ApiError, type Language, type MessageKey, type MessageParams } from '@kapp/shared';

/**
 * Errors that are safe to send to the client.
 *
 * Why classes instead of `reply.code(...).send(...)` in every route: routes and services just
 * `throw`, and one error handler (error-handler.ts) turns everything into the same JSON shape.
 * Anything that is NOT an HttpError is treated as a bug and its details never leave the server.
 *
 * Why a message key instead of a text: the client chooses the language (Accept-Language), which a
 * service does not know. The error carries `key` + `params` from packages/shared/src/i18n and the
 * error handler translates it per request. `Error.message` is the English text, so server logs
 * stay English whatever the user's language is.
 */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly key: MessageKey,
    readonly params?: MessageParams,
    /** `cause` is for the server log only; the client never sees it. */
    options?: ErrorOptions,
  ) {
    super(translate('en', key, params), options);
    this.name = new.target.name;
  }

  /** The user-facing text in a language. */
  localize(language: Language): string {
    return translate(language, this.key, this.params);
  }

  toResponse(language: Language = DEFAULT_LANGUAGE): ApiError {
    return { error: true, message: this.localize(language) };
  }
}

export class BadRequestError extends HttpError {
  constructor(key: MessageKey = 'errors.badRequest', params?: MessageParams) {
    super(400, key, params);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(key: MessageKey = 'errors.unauthorized') {
    super(401, key);
  }
}

export class ForbiddenError extends HttpError {
  constructor(key: MessageKey = 'errors.forbidden') {
    super(403, key);
  }
}

export class NotFoundError extends HttpError {
  constructor(key: MessageKey = 'errors.notFound') {
    super(404, key);
  }
}

/** The request is valid but clashes with current state (e.g. a concurrent duplicate). */
export class ConflictError extends HttpError {
  constructor(key: MessageKey = 'errors.conflict', params?: MessageParams) {
    super(409, key, params);
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(key: MessageKey = 'errors.tooManyRequests') {
    super(429, key);
  }
}

/** Downstream dependency (database, storage, push service) is slow or unreachable. */
export class ServiceUnavailableError extends HttpError {
  constructor(key: MessageKey = 'errors.serviceUnavailable', options?: ErrorOptions) {
    super(503, key, undefined, options);
  }
}
