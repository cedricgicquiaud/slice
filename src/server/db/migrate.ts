/**
 * Applies the versioned migrations of `./migrations`, under a lock so that two
 * servers starting together never migrate twice. Resolved from this file, not
 * the working directory: the build copies the folder next to the compiled
 * module.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { Database } from './client';

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** PostgreSQL advisory lock key reserved for SLICE's migrations. */
const MIGRATION_LOCK_KEY = 5_810_423_077;

/** PGlite lives in one process: its migrations queue behind each other here. */
const pgliteQueues = new WeakMap<PGlite, Promise<unknown>>();

export async function migrateDatabase(database: Database): Promise<void> {
  try {
    if (database.driver === 'pglite') {
      const previous = pgliteQueues.get(database.client) ?? Promise.resolve();
      const run = previous.catch(() => {}).then(() => migratePglite(database.db, { migrationsFolder }));
      pgliteQueues.set(database.client, run);
      await run;
      return;
    }
    // A session lock lives on one connection: take it, migrate and release on that same one.
    const connection = await database.pool.connect();
    try {
      await connection.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
      try {
        await migratePostgres(drizzle(connection), { migrationsFolder });
      } finally {
        await connection.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
      }
    } finally {
      connection.release();
    }
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
