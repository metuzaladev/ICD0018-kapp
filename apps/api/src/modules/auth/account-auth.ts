import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';

import type { ResolveSessionStart } from '../account/account.routes';
import type { AccountAuth, AuthRequest } from '../account/account.service';
import type { Auth } from './auth';

/**
 * The few Better Auth capabilities the account module needs (M10), behind its own small interface so
 * the account service can be unit-tested without Better Auth.
 */
export function createAccountAuth(auth: Pick<Auth, '$context' | 'api'>): AccountAuth {
  return {
    async verifyPassword(userId, password) {
      // Better Auth's own hasher (scrypt with its parameters), so the check is exactly the one used
      // at sign-in. A password-less account (Apple/Google only) never matches.
      const ctx = await auth.$context;
      const accounts = await ctx.internalAdapter.findAccounts(userId);
      const credential = accounts.find((a) => a.providerId === 'credential' && a.password);
      if (!credential?.password) return false;
      return ctx.password.verify({ hash: credential.password, password });
    },

    async sendVerificationEmail(request: AuthRequest, email) {
      try {
        // Server-side call with the user's own session headers: Better Auth checks that the address
        // is the session's and not yet verified. The public HTTP path is disabled (auth.ts), so a
        // stranger cannot make Käpp email arbitrary addresses.
        await auth.api.sendVerificationEmail({ body: { email }, headers: fromNodeHeaders(request.headers) });
        return 'sent';
      } catch (error) {
        if (error instanceof APIError && (error.body as { code?: string } | undefined)?.code === 'EMAIL_ALREADY_VERIFIED') return 'already-verified';
        throw error;
      }
    },
  };
}

/** Session creation time = the last real sign-in (Better Auth only extends `expiresAt` on use). */
export function createSessionStartResolver(auth: Pick<Auth, 'api'>): ResolveSessionStart {
  return async (request) => {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    return result ? new Date(result.session.createdAt) : null;
  };
}
