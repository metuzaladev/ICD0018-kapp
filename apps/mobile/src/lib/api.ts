import { apiErrorSchema } from '@kapp/shared';

import i18n, { currentLanguage } from '@/i18n';

import { authClient } from './auth-client';
import { API_ORIGIN } from './config';

/**
 * The only place in the app that talks to our REST API.
 * Why: base URL, session cookie, language, timeout and the `{ error, message }` contract are handled
 * once, so screens only deal with data or an ApiRequestError whose message is safe to show.
 */

const BASE_URL = `${API_ORIGIN}/api/v1`;
const TIMEOUT_MS = 10_000;

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  // The API translates error messages per Accept-Language, so they match the app's language.
  const headers: Record<string, string> = { accept: 'application/json', 'accept-language': currentLanguage() };
  // The Expo auth client keeps the session cookie in SecureStore; attach it manually because
  // React Native's fetch has no shared cookie jar with Better Auth. A Keychain failure must not
  // break public endpoints: continue anonymously and let protected ones answer 401.
  try {
    const cookie = await authClient.getCookie();
    if (cookie) headers.cookie = cookie;
  } catch (e) {
    if (__DEV__) console.warn('Could not read the session cookie', e);
  }
  if (body !== undefined) headers['content-type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Network down, DNS failure or timeout — the "Offline State" screen in Figma covers this.
    throw new ApiRequestError(i18n.t('errors.network'), 0);
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    throw new ApiRequestError(parsed.success ? parsed.data.message : i18n.t('errors.unknown'), res.status);
  }
  return data as T;
}

export function apiGet<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const query = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : '';
  return request<T>('GET', `${path}${query}`);
}

export function apiSend<T>(method: Exclude<Method, 'GET'>, path: string, body?: unknown): Promise<T> {
  return request<T>(method, path, body);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  // Unexpected (programming) errors: show the cause in development builds only.
  return __DEV__ ? i18n.t('errors.genericDev', { detail: String(error) }) : i18n.t('errors.generic');
}
