// WAT-112 — in production, Better Auth's origin check never switches off (D16, decision 26):
// not even with TEST posed, which Better Auth reads as "under test, origin check off".
// Vitest poses TEST=true: these tests run in exactly that situation.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAuth, type SliceAuth } from './auth';
import { createTestAccount, TEST_AUTH_SECRET, type TestAccount } from '../db/test-account';

/** SLICE's own page. */
const SLICE_PAGE = 'http://localhost:5173';

let account: TestAccount;
let auth: SliceAuth;

beforeAll(async () => {
  account = await createTestAccount({ email: 'targeted@example.com' });
  auth = createAuth({ database: account.database, secret: TEST_AUTH_SECRET, baseURL: SLICE_PAGE, nodeEnv: 'production' });
}, 30_000);

afterAll(async () => {
  await account?.dispose();
});

/** Asks the production auth to delete the account, as a page on `origin` would. */
function deleteFrom(origin: string): Promise<Response> {
  return auth.handler(
    new Request(`${SLICE_PAGE}/api/auth/delete-user`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: account.cookie, origin },
      body: '{}',
    })
  );
}

/** The address signed in by the account's cookie, or `null` once its session is gone. */
async function signedInEmail(): Promise<string | null> {
  const res = await auth.handler(
    new Request(`${SLICE_PAGE}/api/auth/get-session`, { headers: { cookie: account.cookie } })
  );
  return ((await res.json()) as { user: { email: string } } | null)?.user.email ?? null;
}

describe('in production, with TEST posed', () => {
  it('refuses a deletion sent from another site with 403, and keeps the account', async () => {
    expect(process.env.TEST).toBe('true');

    const res = await deleteFrom('https://evil.example');

    expect({ status: res.status, account: await signedInEmail() }).toEqual({
      status: 403,
      account: 'targeted@example.com',
    });
  });

  it("deletes the account when asked from SLICE's own page", async () => {
    const res = await deleteFrom(SLICE_PAGE);

    expect({ status: res.status, account: await signedInEmail() }).toEqual({ status: 200, account: null });
  });
});
