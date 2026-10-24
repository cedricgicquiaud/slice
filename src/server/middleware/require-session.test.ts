// WAT-96 — nothing works without an account: the API refuses a call without a session.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createTestAccount } from '../db/test-account';

describe('session guard on the API', () => {
  it('answers 401 UNAUTHORIZED to an API call without a session', async () => {
    const res = await request(createApp({ nodeEnv: 'test' })).post('/api/upload');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('leaves the sign-in routes open: without a session, the current session reads as none', async () => {
    const account = await createTestAccount();
    try {
      const res = await request(createApp({ nodeEnv: 'test', auth: account.auth })).get('/api/auth/get-session');

      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    } finally {
      await account.dispose();
    }
  });

  it('answers 503 SERVICE_UNAVAILABLE, not unauthorized, while the accounts database is unreachable', async () => {
    const account = await createTestAccount();
    await account.database.close();
    try {
      const res = await request(createApp({ nodeEnv: 'test', auth: account.auth }))
        .post('/api/upload')
        .set('Cookie', account.cookie);

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
    } finally {
      await account.dispose().catch(() => {});
    }
  });
});
