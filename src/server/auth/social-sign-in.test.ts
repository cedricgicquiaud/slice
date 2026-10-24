// WAT-97 — signing in with Google or Microsoft. The providers are simulated at
// the network boundary: their token endpoint answers with the person's profile.
import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { createAuth } from './auth';
import { createTestAccount, TEST_AUTH_SECRET, type TestAccount } from '../db/test-account';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
// `common` takes personal and work or school Microsoft accounts alike.
const MICROSOFT_TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
// Microsoft's fixed tenant of personal accounts.
const PERSONAL_MICROSOFT_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';

let account: TestAccount;
let app: Express;

beforeAll(async () => {
  account = await createTestAccount();
  const auth = createAuth({
    database: account.database,
    secret: TEST_AUTH_SECRET,
    google: { clientId: 'google-client-id', clientSecret: 'google-client-secret' },
    microsoft: { clientId: 'microsoft-client-id', clientSecret: 'microsoft-client-secret' },
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

describe('sign-in with Microsoft', () => {
  it('opens a session for a personal Microsoft account', async () => {
    const { session } = await signInWith('microsoft', MICROSOFT_TOKEN_ENDPOINT, {
      oid: 'microsoft-grace',
      tid: PERSONAL_MICROSOFT_TENANT,
      email: 'grace@outlook.com',
      verified_primary_email: ['grace@outlook.com'],
      name: 'Grace Hopper',
    });

    expect(session.user.email).toBe('grace@outlook.com');
  });

  it('opens a session for a work or school Microsoft account', async () => {
    const { session } = await signInWith('microsoft', MICROSOFT_TOKEN_ENDPOINT, {
      oid: 'microsoft-katherine',
      tid: 'a1b2c3d4-0000-4000-8000-00000000c0de',
      email: 'katherine@contoso.com',
      verified_primary_email: ['katherine@contoso.com'],
      name: 'Katherine Johnson',
    });

    expect(session.user.email).toBe('katherine@contoso.com');
  });
});

describe('one account per verified address (D7)', () => {
  it('finds the existing account of that address, through Google as through Microsoft', async () => {
    const existing = await request(app).get('/api/auth/get-session').set('Cookie', account.cookie);

    const google = await signInWith('google', GOOGLE_TOKEN_ENDPOINT, {
      sub: 'google-account',
      email: 'account@slice.test',
      email_verified: true,
      name: 'Account',
    });
    const microsoft = await signInWith('microsoft', MICROSOFT_TOKEN_ENDPOINT, {
      oid: 'microsoft-account',
      tid: PERSONAL_MICROSOFT_TENANT,
      email: 'account@slice.test',
      verified_primary_email: ['account@slice.test'],
      name: 'Account',
    });

    expect([google.session.user.id, microsoft.session.user.id]).toEqual([existing.body.user.id, existing.body.user.id]);
  });
});
