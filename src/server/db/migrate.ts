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
  if (database.driver === 'pglite') {
    await migratePglite(database.db, { migrationsFolder });
    return;
  }
  await migratePostgres(database.db, { migrationsFolder });
}
