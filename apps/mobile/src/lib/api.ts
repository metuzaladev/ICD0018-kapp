import { apiErrorSchema } from '@kapp/shared';

import { authClient } from './auth-client';
import { API_ORIGIN } from './config';

/**
 * The only place in the app that talks to our REST API.
 * Why: base URL, session cookie, timeout and the `{ error, message }` contract are handled once,
 * so screens only deal with data or an ApiRequestError whose message is safe to show.
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

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  // The Expo auth client keeps the session cookie in SecureStore; attach it manually because
  // React Native's fetch has no shared cookie jar with Better Auth.
  const cookie = await authClient.getCookie();
  if (cookie) headers.cookie = cookie;
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
    throw new ApiRequestError('Internetiühendus puudub või server ei vasta', 0);
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    throw new ApiRequestError(parsed.success ? parsed.data.message : 'Midagi läks valesti', res.status);
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
  return error instanceof ApiRequestError ? error.message : 'Midagi läks valesti, proovi uuesti';
}
