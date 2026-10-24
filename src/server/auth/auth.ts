/**
 * Accounts and sessions of SLICE (Better Auth), kept in SLICE's own database.
 * No password anywhere: Better Auth's email-and-password sign-in stays off.
 */
import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getIP } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import type { Database } from '../db/client';
import { accounts, sessions, users, verifications, workspaces } from '../db/schema';

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

const HOUR_MS = 60 * 60 * 1000;

export function createAuth({ database, secret, baseURL, google, microsoft, sendCode }: AuthOptions) {
  // Better Auth logs a failed send and answers success anyway: the requests
  // whose code did not leave are marked here, and answered as such below.
  const unsent = new WeakSet<object>();
  // D13: when codes left, by address and by IP, over the last hour. A code not sent counts not.
  const codesSent = new Map<string, number[]>();
  const sentWithinHour = (key: string) => (codesSent.get(key) ?? []).filter((at) => Date.now() - at < HOUR_MS);
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
        if (sentWithinHour(`address:${email}`).length >= 5) {
          throw new APIError('TOO_MANY_REQUESTS', {
            code: 'too_many_codes_for_address',
            message: 'Too many codes asked for this address. Try again in an hour.',
          });
        }
        const ip = ctx.headers && getIP(ctx.headers, ctx.context.options);
        if (ip && sentWithinHour(`ip:${ip}`).length >= 10) {
          throw new APIError('TOO_MANY_REQUESTS', {
            code: 'too_many_codes_from_ip',
            message: 'Too many codes asked from your network. Try again in an hour.',
          });
        }
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
                codesSent.set(`address:${email}`, [...sentWithinHour(`address:${email}`), Date.now()]);
                const ip = ctx?.headers && getIP(ctx.headers, ctx.context.options);
                if (ip) codesSent.set(`ip:${ip}`, [...sentWithinHour(`ip:${ip}`), Date.now()]);
              } catch (err) {
                if (ctx) unsent.add(ctx.context);
                throw err;
              }
            },
          }),
        ]
      : [],
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

/** The Google and Microsoft applications of the environment; one without its ID or secret is left out. */
export function oauthApplicationsFromEnv(env: NodeJS.ProcessEnv): Pick<AuthOptions, 'google' | 'microsoft'> {
  const application = (clientId?: string, clientSecret?: string) =>
    clientId && clientSecret ? { clientId, clientSecret } : undefined;
  return {
    google: application(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
    microsoft: application(env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET),
  };
}
