/**
 * Signs an email address in without any proof: its account (created if new)
 * and a fresh session. For tests and the dev-only recette primer, never for a
 * route reachable in production.
 */
import { makeSignature } from 'better-auth/crypto';
import type { SliceAuth } from './auth';

export interface SessionCookie {
  name: string;
  /** Signed session token, as Better Auth reads it back. */
  value: string;
}

export async function openSession(auth: SliceAuth, email: string): Promise<SessionCookie> {
  const ctx = await auth.$context;
  const user =
    (await ctx.internalAdapter.findUserByEmail(email))?.user ??
    (await ctx.internalAdapter.createUser({ email, name: '', emailVerified: true }, { method: 'admin' }));
  const { token } = await ctx.internalAdapter.createSession(user.id);
  return { name: ctx.authCookies.sessionToken.name, value: `${token}.${await makeSignature(token, ctx.secret)}` };
}
