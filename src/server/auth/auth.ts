/**
 * Accounts and sessions of SLICE (Better Auth), kept in SLICE's own database.
 * No password anywhere: Better Auth's email-and-password sign-in stays off.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Database } from '../db/client';
import { accounts, sessions, users, verifications } from '../db/schema';

export interface AuthOptions {
  database: Database;
  /** Signs the session cookies. Defaults to BETTER_AUTH_SECRET. */
  secret?: string;
  /** SLICE's public address. Defaults to BETTER_AUTH_URL, else read from each request. */
  baseURL?: string;
  /** Google sign-in; left out when SLICE has no Google application. */
  google?: OAuthApplication;
}

/** An application declared with a provider (`docs/oauth-apps.md`). */
export interface OAuthApplication {
  clientId: string;
  clientSecret: string;
}

export function createAuth({ database, secret, baseURL, google }: AuthOptions) {
  return betterAuth({
    secret,
    baseURL,
    basePath: '/api/auth',
    // The check expects Better Auth's `account.password` column, deliberately absent.
    advanced: { database: { validateSchema: false } },
    database: drizzleAdapter(database.db, {
      provider: 'pg',
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    socialProviders: { ...(google && { google }) },
  });
}

export type SliceAuth = ReturnType<typeof createAuth>;

/** BETTER_AUTH_SECRET; refused missing in production, where sessions would be signed with a public default. */
export function authSecretFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  if (env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_SECRET is required in production (it signs the session cookies).');
  }
  return undefined;
}
