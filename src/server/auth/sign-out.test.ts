// WAT-100 — once signed out, the session is over: its cookie opens neither SLICE nor its API (D8).
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { openSession } from './open-session';
import { createTestAccount, type TestAccount } from '../db/test-account';

let account: TestAccount;
let app: Express;
/** The `Cookie` header of a session signed out by the time the tests run. */
let signedOutCookie: string;

beforeAll(async () => {
  account = await createTestAccount();
  app = createApp({ nodeEnv: 'test', auth: account.auth });
  const { name, value } = await openSession(account.auth, 'leaving@example.com');
  signedOutCookie = `${name}=${value}`;
  await request(app).post('/api/auth/sign-out').set('Cookie', signedOutCookie);
});

afterAll(async () => {
  await account?.dispose();
});

describe('after Sign out', () => {
  it('reads the old session cookie as no session: SLICE shows the sign-in screen, /mcps included', async () => {
    const res = await request(app).get('/api/auth/get-session').set('Cookie', signedOutCookie);

    expect(res.body).toBeNull();
  });

  it('refuses an API call carrying the old session cookie', async () => {
    const res = await request(app).post('/api/upload').set('Cookie', signedOutCookie);

    expect(res.status).toBe(401);
  });
});
