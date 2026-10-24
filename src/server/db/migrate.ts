/**
 * Applies the versioned migrations of `./migrations`. Resolved from this file,
 * not the working directory: the build copies the folder next to the compiled
 * module.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { Database } from './client';

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrateDatabase(database: Database): Promise<void> {
  try {
    if (database.driver === 'pglite') {
      await migratePglite(database.db, { migrationsFolder });
      return;
    }
    await migratePostgres(database.db, { migrationsFolder });
  } catch (err) {
    throw new Error(`Database migrations failed: ${rootMessage(err)}`, { cause: err });
  }
}

/** The database's own words: Drizzle wraps them in a "Failed query" error. */
function rootMessage(err: unknown): string {
  let current = err;
  while (current instanceof Error && current.cause instanceof Error) current = current.cause;
  return current instanceof Error ? current.message : String(current);
}
