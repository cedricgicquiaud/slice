/**
 * Opens the database the hosted connectors live in: PostgreSQL when a URL is
 * given, otherwise PGlite (embedded PostgreSQL, nothing to install) — on disk
 * in `dataDir`, or in memory without one.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { SQL } from 'drizzle-orm';
import { drizzle as drizzlePostgres, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import pg from 'pg';
import * as schema from './schema';

export type DatabaseConfig = { driver: 'postgres'; url: string } | { driver: 'pglite'; dataDir?: string };

type Schema = typeof schema;

interface DatabaseHandle {
  /** Run a raw query and return its rows, whatever the driver. */
  rows<T>(query: SQL): Promise<T[]>;
  close(): Promise<void>;
}

export type Database =
  | (DatabaseHandle & { driver: 'postgres'; db: NodePgDatabase<Schema>; pool: pg.Pool })
  | (DatabaseHandle & { driver: 'pglite'; db: PgliteDatabase<Schema>; client: PGlite });

/**
 * `DATABASE_URL` when set; otherwise PGlite on disk under `SLICE_DATA_DIR`
 * (default `./data`) — refused in production, where a redeploy would lose it.
 */
export function databaseConfigFromEnv(env: NodeJS.ProcessEnv): DatabaseConfig {
  if (env.DATABASE_URL) return { driver: 'postgres', url: env.DATABASE_URL };
  if (env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production (an embedded database would be lost at the next deploy).');
  }
  return { driver: 'pglite', dataDir: path.resolve(env.SLICE_DATA_DIR ?? './data', 'pglite') };
}

export function openDatabase(config: DatabaseConfig): Database {
  if (config.driver === 'postgres') {
    // Give up on an unreachable server instead of waiting forever: the caller answers 503.
    const pool = new pg.Pool({ connectionString: config.url, connectionTimeoutMillis: 5_000 });
    // An idle connection dropped by the server must not crash the process; the pool reconnects.
    pool.on('error', (err) => {
      console.error('[db] lost an idle database connection:', err.message);
    });
    const db = drizzlePostgres(pool, { schema });
    return {
      driver: 'postgres',
      db,
      pool,
      async rows<T>(query: SQL) {
        return (await db.execute(query)).rows as T[];
      },
      close: () => pool.end(),
    };
  }
  if (config.dataDir) mkdirSync(config.dataDir, { recursive: true });
  const client = new PGlite(config.dataDir);
  const db = drizzlePglite(client, { schema });
  return {
    driver: 'pglite',
    db,
    client,
    async rows<T>(query: SQL) {
      return (await db.execute(query)).rows as T[];
    },
    close: () => client.close(),
  };
}
