/**
 * Test support — a signed-in account: the auth that knows it and the cookie of
 * its live session. On a fresh in-memory database by default, or on the
 * database the test already opened.
 */
import { makeSignature } from 'better-auth/crypto';
import { createAuth, type SliceAuth } from '../auth/auth';
import { openDatabase, type Database } from './client';
import { migrateDatabase } from './migrate';
import { createTestDatabase } from './test-database';

/** The session cookies' signing key in tests; a server spawned by a test gets it as BETTER_AUTH_SECRET. */
export const TEST_AUTH_SECRET = 'slice-test-secret-not-for-production-0123456789';

export interface TestAccount {
  auth: SliceAuth;
  database: Database;
  /** Value of the `Cookie` header that carries the account's session. */
  cookie: string;
  dispose(): Promise<void>;
}

export async function createTestAccount(
  options: { database?: Database; email?: string } = {}
): Promise<TestAccount> {
  if (options.database) {
    const auth = createAuth({ database: options.database, secret: TEST_AUTH_SECRET });
    const cookie = await openSession(auth, options.email ?? 'account@slice.test');
    return { auth, database: options.database, cookie, dispose: async () => {} };
  }
  const testDb = await createTestDatabase();
  const database = openDatabase(testDb.config);
  await migrateDatabase(database);
  const account = await createTestAccount({ ...options, database });
  return {
    ...account,
    dispose: async () => {
      await database.close();
      await testDb.dispose();
    },
  };
}

/** Sign `email` in without any proof: its account (created if new) and a fresh session's cookie. */
async function openSession(auth: SliceAuth, email: string): Promise<string> {
  const ctx = await auth.$context;
  const user =
    (await ctx.internalAdapter.findUserByEmail(email))?.user ??
    (await ctx.internalAdapter.createUser({ email, name: '', emailVerified: true }, { method: 'admin' }));
  const { token } = await ctx.internalAdapter.createSession(user.id);
  return `${ctx.authCookies.sessionToken.name}=${token}.${await makeSignature(token, ctx.secret)}`;
}
