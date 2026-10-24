// WAT-98 — signing in with a code received by email.
import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import type { Express } from 'express';
import { createApp } from '../app';
import { createAuth, type SendCode } from './auth';
import { codeSenderFromEnv } from './email-code';
import { createTestAccount, TEST_AUTH_SECRET, type TestAccount } from '../db/test-account';

let account: TestAccount;
let app: Express;
/** The codes SLICE sent, by address. */
const inbox = new Map<string, string>();

beforeAll(async () => {
  account = await createTestAccount();
  const auth = createAuth({
    database: account.database,
    secret: TEST_AUTH_SECRET,
    sendCode: async (email, code) => {
      inbox.set(email, code);
    },
  });
  app = createApp({ nodeEnv: 'development', auth });
});

afterAll(async () => {
  await account?.dispose();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** SLICE on the same database, sending its codes with `sendCode`. */
function appSendingWith(sendCode: SendCode): Express {
  return createApp({ nodeEnv: 'development', auth: createAuth({ database: account.database, secret: TEST_AUTH_SECRET, sendCode }) });
}

/** Any network call fails the test: nothing may leave SLICE. */
function noNetwork() {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    throw new Error(`Unexpected network call: ${input instanceof Request ? input.url : String(input)}`);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

type Browser = ReturnType<typeof request.agent>;

/** Types the address and clicks "Email me a code". */
function askForCode(browser: Browser, email: string) {
  return browser.post('/api/auth/email-otp/send-verification-otp').send({ email, type: 'sign-in' });
}

/** Asks for a code, enters the one received; the session it opened, if any. */
async function signInWithCode(browser: Browser, email: string) {
  await askForCode(browser, email);
  await browser.post('/api/auth/sign-in/email-otp').send({ email, otp: inbox.get(email) });
  return (await browser.get('/api/auth/get-session')).body;
}

describe('sign-in with a code by email', () => {
  it('sends a 6-digit code to the address, and entering it opens a session', async () => {
    const session = await signInWithCode(request.agent(app), 'ada@example.com');

    expect({ code: inbox.get('ada@example.com'), email: session?.user.email }).toEqual({
      code: expect.stringMatching(/^\d{6}$/),
      email: 'ada@example.com',
    });
  });

  it('creates the account of an unknown address and its personal workspace at its first code', async () => {
    const session = await signInWithCode(request.agent(app), 'new@example.com');

    const owned = await account.database.rows<{ owner_id: string }>(
      sql`select owner_id from workspaces where owner_id = ${session.user.id}`
    );
    expect(owned).toHaveLength(1);
  });
});

describe('without a Resend key', () => {
  it('prints the code in the server output, and that code signs in', async () => {
    noNetwork();
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    const browser = request.agent(appSendingWith(codeSenderFromEnv({})));

    await askForCode(browser, 'grace@example.com');
    const printed = output.mock.calls.flat().join(' ').match(/\b\d{6}\b/)?.[0];
    await browser.post('/api/auth/sign-in/email-otp').send({ email: 'grace@example.com', otp: printed });
    const session = await browser.get('/api/auth/get-session');

    expect(session.body?.user.email).toBe('grace@example.com');
  });

  it('sends no email', async () => {
    const network = noNetwork();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await askForCode(request.agent(appSendingWith(codeSenderFromEnv({}))), 'grace@example.com');

    expect(network).not.toHaveBeenCalled();
  });
});
