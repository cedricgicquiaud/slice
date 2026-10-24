// WAT-98 — signing in with a code received by email.
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import type { Express } from 'express';
import { createApp } from '../app';
import { createAuth } from './auth';
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
