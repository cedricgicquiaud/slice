// WAT-96 — nothing works without an account: the API refuses a call without a session.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createTestAccount, type TestAccount } from '../db/test-account';
import { createHostedStore } from '../services/hosted-store';

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

// WAT-101 — SLICE takes an account's orders from its own page only (D16).
describe('a request sent from another site with the session', () => {
  let account: TestAccount;

  beforeAll(async () => {
    account = await createTestAccount();
  });

  afterAll(async () => {
    await account?.dispose();
  });

  const signedInApp = () =>
    createApp({ nodeEnv: 'test', auth: account.auth, hostedStore: createHostedStore(account.database) });

  it('is refused with 403 FORBIDDEN when it would create an MCP', async () => {
    const res = await request(signedInApp())
      .post('/api/host')
      .set('Cookie', account.cookie)
      .set('Origin', 'https://evil.example')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
