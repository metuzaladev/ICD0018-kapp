import { DEFAULT_LANGUAGE, translate, type ApiError, type Language, type MessageKey } from '@kapp/shared';

/**
 * Better Auth answers errors as `{ code, message }` in English. The app expects our standard
 * `{ error: true, message }` in its own language, so the auth proxy rewrites every error through
 * here: the code picks a message key, the request's Accept-Language picks the translation.
 */
const AUTH_ERROR_KEY: Record<string, MessageKey> = {
  USER_ALREADY_EXISTS: 'auth.userExists',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'auth.userExists',
  INVALID_EMAIL_OR_PASSWORD: 'auth.invalidCredentials',
  INVALID_PASSWORD: 'auth.invalidPassword',
  INVALID_EMAIL: 'auth.invalidEmail',
  PASSWORD_TOO_SHORT: 'auth.passwordTooShort',
  PASSWORD_TOO_LONG: 'auth.passwordTooLong',
  INVALID_NAME: 'auth.invalidName',
  INVALID_TOKEN: 'auth.invalidToken',
  EMAIL_NOT_VERIFIED: 'auth.emailNotVerified',
  USER_NOT_FOUND: 'auth.userNotFound',
  FAILED_TO_CREATE_USER: 'auth.createUserFailed',
  LEGAL_VERSION_OUTDATED: 'errors.legalVersionOutdated',
};

const STATUS_KEY: Record<number, MessageKey> = {
  400: 'errors.badRequest',
  401: 'errors.unauthorized',
  403: 'errors.forbidden',
  404: 'errors.notFound',
  422: 'auth.unprocessable',
  429: 'auth.tooManyAttempts',
};

export function translateAuthError(status: number, body: unknown, language: Language = DEFAULT_LANGUAGE): ApiError {
  const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined;
  const known = typeof code === 'string' ? AUTH_ERROR_KEY[code] : undefined;
  const key = known ?? STATUS_KEY[status] ?? (status >= 500 ? 'errors.server' : 'errors.badRequest');
  return { error: true, message: translate(language, key) };
}
