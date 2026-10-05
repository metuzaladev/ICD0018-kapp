import { fromNodeHeaders } from 'better-auth/node';

import type { ResolveUserId } from '../../http/auth';
import type { Auth } from './auth';

/**
 * Reads the session cookie (sent by the Expo client from SecureStore) and returns the user id.
 * Database errors are not swallowed: they become 503, not a misleading 401.
 */
export function createSessionResolver(auth: Pick<Auth, 'api'>): ResolveUserId {
  return async (request) => {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    return result?.user.id ?? null;
  };
}
