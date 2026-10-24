// WAT-96 — nothing works without an account: the API refuses a call without a session.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createTestAccount, type TestAccount } from '../db/test-account';

describe('session guard on the API', () => {
  let account: TestAccount;

  beforeAll(async () => {
    account = await createTestAccount();
  });

  afterAll(async () => {
    await account?.dispose();
  });

  it('answers 401 UNAUTHORIZED to an API call without a session', async () => {
    const res = await request(createApp({ nodeEnv: 'test' })).post('/api/upload');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('leaves the sign-in routes open: without a session, the current session reads as none', async () => {
    const res = await request(createApp({ nodeEnv: 'test', auth: account.auth })).get('/api/auth/get-session');

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe('session guard while the accounts database is unreachable', () => {
  let account: TestAccount;

  beforeAll(async () => {
    account = await createTestAccount();
    await account.database.close();
  });

  afterAll(async () => {
    await account?.dispose().catch(() => {});
  });

  it('answers 503 SERVICE_UNAVAILABLE, not unauthorized', async () => {
    const res = await request(createApp({ nodeEnv: 'test', auth: account.auth }))
      .post('/api/upload')
      .set('Cookie', account.cookie);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
  });
});
