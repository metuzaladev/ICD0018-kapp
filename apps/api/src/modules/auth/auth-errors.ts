import type { ApiError } from '@kapp/shared';

/**
 * Better Auth answers errors as `{ code, message }` in English. The app expects our standard
 * `{ error: true, message }` in Estonian, so the auth proxy rewrites every error through here.
 */
const AUTH_ERROR_TEXT: Record<string, string> = {
  USER_ALREADY_EXISTS: 'Selle e-postiga konto on juba olemas',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Selle e-postiga konto on juba olemas',
  INVALID_EMAIL_OR_PASSWORD: 'Vale e-post või parool',
  INVALID_PASSWORD: 'Vale parool',
  INVALID_EMAIL: 'Sisesta korrektne e-posti aadress',
  PASSWORD_TOO_SHORT: 'Parool on liiga lühike',
  PASSWORD_TOO_LONG: 'Parool on liiga pikk',
  INVALID_NAME: 'Nimi peab olema 2–60 märki',
  INVALID_TOKEN: 'Link on aegunud või vigane, küsi uus',
  EMAIL_NOT_VERIFIED: 'Kinnita oma e-posti aadress',
  USER_NOT_FOUND: 'Kasutajat ei leitud',
  FAILED_TO_CREATE_USER: 'Kontot ei õnnestunud luua, proovi uuesti',
};

const STATUS_TEXT: Record<number, string> = {
  400: 'Vigane päring',
  401: 'Palun logi sisse',
  403: 'Sul pole selleks õigust',
  404: 'Ei leitud',
  422: 'Andmed ei sobi',
  429: 'Liiga palju katseid, proovi hetke pärast uuesti',
};

export function translateAuthError(status: number, body: unknown): ApiError {
  const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined;
  const known = typeof code === 'string' ? AUTH_ERROR_TEXT[code] : undefined;
  return {
    error: true,
    message: known ?? STATUS_TEXT[status] ?? (status >= 500 ? 'Serveri viga, proovi hiljem uuesti' : 'Vigane päring'),
  };
}
