// WAT-111 — a session opened days ago deletes the account (decision 25, amends D11):
// with no password to ask again, Better Auth's "fresh session" rule protects nothing.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestAccount, type TestAccount } from '../db/test-account';
import { sessions, users } from '../db/schema';
import { DATABASE_TEST_TIMEOUTS } from '../db/test-database';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

const SLICE_PAGE = 'http://localhost:5173';
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

let account: TestAccount;

beforeAll(async () => {
  account = await createTestAccount({ email: 'faithful@example.com' });
  // Opened two days ago, renewed at every visit since (D8).
  await account.database.db.update(sessions).set({ createdAt: new Date(Date.now() - TWO_DAYS_MS) });
}, 30_000);

afterAll(async () => {
  await account?.dispose();
});

describe('POST /api/auth/delete-user from a session opened two days ago', () => {
  it('deletes the account', async () => {
    const res = await account.auth.handler(
      new Request(`${SLICE_PAGE}/api/auth/delete-user`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: account.cookie, origin: SLICE_PAGE },
        body: '{}',
      })
    );
    const left = await account.database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'faithful@example.com'));

    expect({ status: res.status, accounts: left.length }).toEqual({ status: 200, accounts: 0 });
  });
});
