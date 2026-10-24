/**
 * Test support — a signed-in account: the auth that knows it, the cookie of its
 * live session and its personal workspace. On a fresh in-memory database by
 * default, or on the database the test already opened.
 */
import { eq } from 'drizzle-orm';
import { createAuth, type SliceAuth } from '../auth/auth';
import { openSession } from '../auth/open-session';
import { openDatabase, type Database } from './client';
import { migrateDatabase } from './migrate';
import { users, workspaces } from './schema';
import { createTestDatabase } from './test-database';

/** The session cookies' signing key in tests; a server spawned by a test gets it as BETTER_AUTH_SECRET. */
export const TEST_AUTH_SECRET = 'slice-test-secret-not-for-production-0123456789';

export interface TestAccount {
  auth: SliceAuth;
  database: Database;
  /** Value of the `Cookie` header that carries the account's session. */
  cookie: string;
  /** The account's personal workspace, created at sign-up (D15). */
  workspaceId: string;
  dispose(): Promise<void>;
}

export async function createTestAccount(
  options: { database?: Database; email?: string } = {}
): Promise<TestAccount> {
  if (options.database) {
    const auth = createAuth({ database: options.database, secret: TEST_AUTH_SECRET });
    const email = options.email ?? 'account@slice.test';
    const { name, value } = await openSession(auth, email);
    const [workspace] = await options.database.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .innerJoin(users, eq(users.id, workspaces.ownerId))
      .where(eq(users.email, email));
    if (!workspace) throw new Error(`${email} signed in without a workspace`);
    return {
      auth,
      database: options.database,
      cookie: `${name}=${value}`,
      workspaceId: workspace.id,
      dispose: async () => {},
    };
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
