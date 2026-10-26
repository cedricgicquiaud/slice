// WAT-96 — the recette primer (`.pilot/amorce-recette.js`) signs a recette account
// in on the app run by `pnpm dev`; production never lets it.
import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createTestAccount, type TestAccount } from '../db/test-account';
import { DATABASE_TEST_TIMEOUTS } from '../db/test-database';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

let account: TestAccount;

beforeAll(async () => {
  account = await createTestAccount();
});

afterAll(async () => {
  await account?.dispose();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/dev/sign-in', () => {
  it('signs the recette account in outside production', async () => {
    const browser = request.agent(createApp({ nodeEnv: 'development', auth: account.auth }));

    await browser.post('/api/dev/sign-in').expect(204);
    const res = await browser.get('/api/auth/get-session');

    expect(res.body.user.email).toBe('recette@slice.local');
  });

  it('opens no session when NODE_ENV=production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const browser = request.agent(createApp({ auth: account.auth }));

    const signIn = await browser.post('/api/dev/sign-in');
    const res = await browser.get('/api/auth/get-session');

    expect(signIn.headers['set-cookie']).toBeUndefined();
    expect(res.body).toBeNull();
  });

  it('opens no session on a server started without NODE_ENV', async () => {
    vi.stubEnv('NODE_ENV', undefined);
    const browser = request.agent(createApp({ auth: account.auth }));

    const signIn = await browser.post('/api/dev/sign-in');
    const res = await browser.get('/api/auth/get-session');

    expect(signIn.headers['set-cookie']).toBeUndefined();
    expect(res.body).toBeNull();
  });
});
