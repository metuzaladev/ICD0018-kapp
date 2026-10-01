import { apiErrorSchema } from '@kapp/shared';

/**
 * The only place in the app that talks HTTP.
 * Why: base URL, timeout and the `{ error, message }` contract are handled once, so screens
 * only deal with data or an ApiRequestError whose message is safe to show.
 */

const BASE_URL = `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/v1`;
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

export async function apiGet<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const query = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : '';
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    // Network down, DNS failure or timeout — the "Offline State" screen in Figma covers this.
    throw new ApiRequestError('Internetiühendus puudub või server ei vasta', 0);
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new ApiRequestError(parsed.success ? parsed.data.message : 'Midagi läks valesti', res.status);
  }
  return body as T;
}
