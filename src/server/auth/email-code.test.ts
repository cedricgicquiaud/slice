// WAT-98 — signing in with a code received by email.
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
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

/** Types the address and clicks "Email me a code". */
function askForCode(browser: ReturnType<typeof request.agent>, email: string) {
  return browser.post('/api/auth/email-otp/send-verification-otp').send({ email, type: 'sign-in' });
}

describe('sign-in with a code by email', () => {
  it('sends a 6-digit code to the address, and entering it opens a session', async () => {
    const browser = request.agent(app);

    await askForCode(browser, 'ada@example.com');
    const code = inbox.get('ada@example.com');
    await browser.post('/api/auth/sign-in/email-otp').send({ email: 'ada@example.com', otp: code });
    const session = await browser.get('/api/auth/get-session');

    expect({ code, email: session.body?.user.email }).toEqual({ code: expect.stringMatching(/^\d{6}$/), email: 'ada@example.com' });
  });
});
