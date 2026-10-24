// WAT-97 — signing in with Google or Microsoft. The providers are simulated at
// the network boundary: their token endpoint answers with the person's profile.
import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { createAuth } from './auth';
import { createTestAccount, TEST_AUTH_SECRET, type TestAccount } from '../db/test-account';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

let account: TestAccount;
let app: Express;

beforeAll(async () => {
  account = await createTestAccount();
  const auth = createAuth({
    database: account.database,
    secret: TEST_AUTH_SECRET,
    google: { clientId: 'google-client-id', clientSecret: 'google-client-secret' },
  });
  app = createApp({ nodeEnv: 'development', auth });
});

afterAll(async () => {
  await account?.dispose();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** An id token as a token endpoint returns it; the code flow reads its claims without checking the signature. */
function idToken(claims: Record<string, unknown>): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256', typ: 'JWT' })}.${part(claims)}.signature`;
}

/** The provider's token endpoint hands back this profile; any other network call fails the test. */
function providerAnswers(tokenEndpoint: string, claims: Record<string, unknown>) {
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== tokenEndpoint) throw new Error(`Unexpected network call: ${url}`);
    return Response.json({ access_token: 'access-token', token_type: 'Bearer', expires_in: 3600, id_token: idToken(claims) });
  });
}

/** Clicks "Continue with <provider>", then comes back from the provider with an authorization code. */
async function signInWith(provider: string, tokenEndpoint: string, claims: Record<string, unknown>) {
  const browser = request.agent(app);
  const start = await browser
    .post('/api/auth/sign-in/social')
    .send({ provider, callbackURL: '/', errorCallbackURL: '/' });
  const state = new URL(start.body.url).searchParams.get('state');
  providerAnswers(tokenEndpoint, claims);
  const callback = await browser.get(`/api/auth/callback/${provider}`).query({ code: 'authorization-code', state });
  const session = await browser.get('/api/auth/get-session');
  return { callback, session: session.body };
}

describe('sign-in with Google', () => {
  it('opens a session for a Google account whose address Google verified', async () => {
    const { session } = await signInWith('google', GOOGLE_TOKEN_ENDPOINT, {
      sub: 'google-ada',
      email: 'ada@gmail.com',
      email_verified: true,
      name: 'Ada Lovelace',
    });

    expect(session.user.email).toBe('ada@gmail.com');
  });
});
