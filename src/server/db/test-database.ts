/**
 * Test support — a fresh database per test file. PGlite in memory by default
 * (nothing to install); with `DATABASE_URL` set (CI storage tests), a throwaway
 * database created on that PostgreSQL server and dropped afterwards, so the
 * data of the database the URL names is never touched.
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import type { DatabaseConfig } from './client';

export interface TestDatabase {
  config: DatabaseConfig;
  dispose(): Promise<void>;
}

export async function createTestDatabase(options: { persistent?: boolean } = {}): Promise<TestDatabase> {
  const serverUrl = process.env.DATABASE_URL;
  if (serverUrl) return createThrowawayPostgres(serverUrl);
  if (!options.persistent) return { config: { driver: 'pglite' }, dispose: async () => {} };
  const dataDir = mkdtempSync(join(tmpdir(), 'slice-pglite-'));
  return {
    config: { driver: 'pglite', dataDir },
    dispose: async () => rmSync(dataDir, { recursive: true, force: true }),
  };
}

async function createThrowawayPostgres(serverUrl: string): Promise<TestDatabase> {
  const name = `slice_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: serverUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return {
    config: { driver: 'postgres', url: url.toString() },
    dispose: async () => {
      const cleanup = new pg.Client({ connectionString: serverUrl });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await cleanup.end();
    },
  };
}
