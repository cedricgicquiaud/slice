/**
 * Accounts and sessions of SLICE (Better Auth), kept in SLICE's own database.
 * No password anywhere: Better Auth's email-and-password sign-in stays off.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware, getIP } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import type { Database } from '../db/client';
import { accounts, sessions, users, verifications, workspaces } from '../db/schema';
import { createCodeQuotas, type CodeQuota } from './code-quotas';

export interface AuthOptions {
  database: Database;
  /** Signs the session cookies. Defaults to BETTER_AUTH_SECRET. */
  secret?: string;
  /** SLICE's public address. Defaults to BETTER_AUTH_URL, else read from each request. */
  baseURL?: string;
  /** Google sign-in; left out when SLICE has no Google application. */
  google?: OAuthApplication;
  /** Microsoft sign-in, personal and work or school accounts (tenant `common`); left out without an application. */
  microsoft?: OAuthApplication;
  /** Hands a sign-in code to its address; without it, no sign-in by code. */
  sendCode?: SendCode;
}

/** Delivers a sign-in code to an email address; rejects when it could not. */
export type SendCode = (email: string, code: string) => Promise<void>;

/** An application declared with a provider (`docs/oauth-apps.md`). */
export interface OAuthApplication {
  clientId: string;
  clientSecret: string;
}

/** What a refused request for a code answers, by the quota it would exceed. */
const QUOTA_REFUSALS: Record<CodeQuota, { code: string; message: string }> = {
  address: { code: 'too_many_codes_for_address', message: 'Too many codes asked for this address. Try again in an hour.' },
  ip: { code: 'too_many_codes_from_ip', message: 'Too many codes asked from your network. Try again in an hour.' },
};

export function createAuth({ database, secret, baseURL, google, microsoft, sendCode }: AuthOptions) {
  // Better Auth logs a failed send and answers success anyway: the requests
  // whose code did not leave are marked here, and answered as such below.
  const unsent = new WeakSet<object>();
  const quotas = createCodeQuotas();
  const auth = betterAuth({
    secret,
    baseURL,
    basePath: '/api/auth',
    // The check expects Better Auth's `account.password` column, deliberately absent.
    advanced: { database: { validateSchema: false } },
    // D8: seven days from the last visit, whenever it falls; every visit renews the session.
    // Decision 25: any live session deletes the account. Better Auth asks for one opened less
    // than a day ago, which guards a password retyped; SLICE has none.
    session: { expiresIn: 7 * 24 * 60 * 60, updateAge: 0, freshAge: 0 },
    // D11: `POST /api/auth/delete-user` erases the account at once; the schema cascades
    // to its sessions, workspace and MCPs.
    user: { deleteUser: { enabled: true } },
    database: drizzleAdapter(database.db, {
      provider: 'pg',
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    databaseHooks: {
      user: {
        create: {
          // D6: an account always rests on a proven address. A provider's
          // unverified address never creates one (nor joins one: Better Auth
          // links only verified addresses).
          before: async (user) => {
            if (!user.emailVerified) {
              throw new APIError('FORBIDDEN', {
                code: 'email_not_verified',
                message: 'The provider did not verify this email address.',
              });
            }
          },
          // D15: every account gets its personal workspace, never shown.
          after: async (user) => {
            await database.db.insert(workspaces).values({ id: randomUUID(), ownerId: user.id, createdAt: new Date() });
          },
        },
      },
    },
    socialProviders: {
      ...(google && { google }),
      // SLICE shows no profile picture: no extra call to Microsoft Graph.
      ...(microsoft && { microsoft: { ...microsoft, tenantId: 'common', disableProfilePhoto: true } }),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/email-otp/send-verification-otp') return;
        const email = String(ctx.body?.email).toLowerCase();
        const exceeded = quotas.exceeded(email, ipOf(ctx));
        if (exceeded) throw new APIError('TOO_MANY_REQUESTS', QUOTA_REFUSALS[exceeded]);
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (unsent.has(ctx.context)) {
          throw new APIError('BAD_GATEWAY', { code: 'code_not_sent', message: "Couldn't send the code, try again." });
        }
      }),
    },
    plugins: sendCode
      ? [
          emailOTP({
            // D13: a code lives ten minutes and takes five tries; the sixth, even right, is refused.
            expiresIn: 10 * 60,
            allowedAttempts: 5,
            sendVerificationOTP: async ({ email, otp }, ctx) => {
              try {
                await sendCode(email, otp);
                quotas.count(email, ctx ? ipOf(ctx) : null);
              } catch (err) {
                if (ctx) unsent.add(ctx.context);
                throw err;
              }
            },
          }),
        ]
      : [],
  });
  return Object.assign(auth, {
    /** The personal workspace of an account (D15), `undefined` if it has none. */
    async workspaceOf(userId: string): Promise<string | undefined> {
      const [workspace] = await database.db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.ownerId, userId));
      return workspace?.id;
    },
  });
}

export type SliceAuth = ReturnType<typeof createAuth>;

/** The caller's IP as Better Auth reads it (`x-forwarded-for`, set by SLICE's proxy), if known. */
function ipOf(ctx: { headers?: Headers; context: { options: BetterAuthOptions } }): string | null {
  return ctx.headers ? getIP(ctx.headers, ctx.context.options) : null;
}

/** BETTER_AUTH_SECRET; refused missing in production, where sessions would be signed with a public default. */
export function authSecretFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  if (env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_SECRET is required in production (it signs the session cookies).');
  }
  return undefined;
}

/**
 * SLICE's public address: BETTER_AUTH_URL. Refused missing in production, where behind
 * a proxy every write from SLICE's own page would answer 403. Elsewhere it defaults to
 * the Vite page (`pnpm dev`), whose proxy hands the API another address.
 */
export function authBaseUrlFromEnv(env: NodeJS.ProcessEnv): string {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  if (env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_URL is required in production (the address the browser uses, e.g. https://slice.example.com).');
  }
  return 'http://localhost:5173';
}

/** The Google and Microsoft applications of the environment; one without its ID or secret is left out. */
export function oauthApplicationsFromEnv(env: NodeJS.ProcessEnv): Pick<AuthOptions, 'google' | 'microsoft'> {
  const application = (clientId?: string, clientSecret?: string) =>
    clientId && clientSecret ? { clientId, clientSecret } : undefined;
  return {
    google: application(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
    microsoft: application(env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET),
  };
}
