// WAT-63 — migrations run before the server listens, once, even when two servers start together.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { openDatabase } from './client';
import { migrateDatabase } from './migrate';
import { createTestDatabase } from './test-database';

const journal = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations/meta/_journal.json'), 'utf-8')
) as { entries: unknown[] };

describe('database migrations', () => {
  it('applies each migration once when two servers migrate the same database together', async () => {
    const testDb = await createTestDatabase();
    const first = openDatabase(testDb.config);
    // PostgreSQL: a second server is a second connection pool. PGlite lives in
    // one process, so its "second server" is a second call on the same instance.
    const second = testDb.config.driver === 'postgres' ? openDatabase(testDb.config) : first;
    try {
      await Promise.all([migrateDatabase(first), migrateDatabase(second)]);

      const [applied] = await first.rows<{ count: number }>(
        sql`select count(*)::int as count from drizzle.__drizzle_migrations`
      );
      expect(applied?.count).toBe(journal.entries.length);
    } finally {
      if (second !== first) await second.close();
      await first.close();
      await testDb.dispose();
    }
  });
});
