// WAT-96 — the recette primer (`.pilot/amorce-recette.js`) signs a recette account
// in on the app run by `pnpm dev`; production never lets it.
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createTestAccount, type TestAccount } from '../db/test-account';

let account: TestAccount;

beforeAll(async () => {
  account = await createTestAccount();
});

afterAll(async () => {
  await account?.dispose();
});

describe('POST /api/dev/sign-in', () => {
  it('signs the recette account in outside production', async () => {
    const browser = request.agent(createApp({ nodeEnv: 'development', auth: account.auth }));

    await browser.post('/api/dev/sign-in').expect(204);
    const res = await browser.get('/api/auth/get-session');

    expect(res.body.user.email).toBe('recette@slice.local');
  });
});
