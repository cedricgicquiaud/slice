// WAT-62 — the two tables follow the feature's schema (D3).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { openDatabase, type Database } from './client';
import { migrateDatabase } from './migrate';
import { createTestDatabase, type TestDatabase } from './test-database';

let testDb: TestDatabase;
let database: Database;

beforeAll(async () => {
  testDb = await createTestDatabase();
  database = openDatabase(testDb.config);
  await migrateDatabase(database);
});

afterAll(async () => {
  await database?.close();
  await testDb?.dispose();
});

function rows<T>(query: SQL): Promise<T[]> {
  return database.rows<T>(query);
}

describe('database schema (D3)', () => {
  it('creates connectors and connector_actions with the columns of the schema', async () => {
    const columns = await rows<{ table_name: string; column_name: string; udt_name: string; is_nullable: string }>(
      sql`select table_name, column_name, udt_name, is_nullable
          from information_schema.columns
          where table_schema = 'public' and table_name in ('connectors', 'connector_actions')
          order by table_name, ordinal_position`
    );

    expect(columns.map((c) => `${c.table_name}.${c.column_name} ${c.udt_name} ${c.is_nullable}`)).toEqual([
      'connector_actions.connector_id text NO',
      'connector_actions.position int4 NO',
      'connector_actions.name text NO',
      'connector_actions.description text NO',
      'connector_actions.method http_method NO',
      'connector_actions.path text NO',
      'connector_actions.params jsonb NO',
      'connectors.id text NO',
      'connectors.name text NO',
      'connectors.base_url text NO',
      'connectors.upstream_auth_type upstream_auth_type NO',
      'connectors.upstream_header_name text YES',
      'connectors.upstream_token_url text YES',
      'connectors.upstream_scopes _text YES',
      'connectors.created_at timestamptz NO',
    ]);
  });

  function insertConnector(id: string, authType: string, headerName: string | null, tokenUrl: string | null) {
    return rows(
      sql`insert into connectors (id, name, base_url, upstream_auth_type, upstream_header_name, upstream_token_url, created_at)
          values (${id}, 'demo', 'https://api.example.com', ${authType}, ${headerName}, ${tokenUrl}, now())`
    );
  }

  it('fills the upstream header name if and only if the access is an API key', async () => {
    await expect(insertConnector('apikey-without-header', 'apiKey', null, null)).rejects.toThrow();
    await expect(insertConnector('bearer-with-header', 'bearer', 'X-Api-Key', null)).rejects.toThrow();
    await expect(insertConnector('apikey-with-header', 'apiKey', 'X-Api-Key', null)).resolves.toBeDefined();
  });

  it('fills the token address if and only if the access is OAuth2', async () => {
    await expect(insertConnector('oauth2-without-url', 'oauth2', null, null)).rejects.toThrow();
    await expect(insertConnector('none-with-url', 'none', null, 'https://auth.example.com/token')).rejects.toThrow();
    await expect(
      insertConnector('oauth2-with-url', 'oauth2', null, 'https://auth.example.com/token')
    ).resolves.toBeDefined();
  });

  function insertAction(connectorId: string, position: number) {
    return rows(
      sql`insert into connector_actions (connector_id, position, name, description, method, path, params)
          values (${connectorId}, ${position}, 'ping', 'Ping', 'GET', '/ping', '[]'::jsonb)`
    );
  }

  it('deletes the actions of a deleted connector', async () => {
    await insertConnector('cascade', 'none', null, null);
    await insertAction('cascade', 0);

    await rows(sql`delete from connectors where id = 'cascade'`);

    expect(await rows(sql`select 1 from connector_actions where connector_id = 'cascade'`)).toEqual([]);
  });

  it('refuses two actions at the same position of a connector', async () => {
    await insertConnector('positions', 'none', null, null);
    await insertAction('positions', 0);

    await expect(insertAction('positions', 0)).rejects.toThrow();
  });

  it('indexes connectors by creation date', async () => {
    const indexes = await rows<{ indexdef: string }>(
      sql`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'connectors'`
    );

    expect(indexes.some((i) => /\(created_at\)$/.test(i.indexdef))).toBe(true);
  });
});

describe('accounts schema (WAT-96)', () => {
  it('keeps accounts, their sign-in methods and their sessions without any password column (D3)', async () => {
    const columns = await rows<{ table_name: string; column_name: string }>(
      sql`select table_name, column_name from information_schema.columns
          where table_schema = 'public' and table_name in ('users', 'accounts', 'sessions', 'verifications')`
    );

    expect(new Set(columns.map((c) => c.table_name))).toEqual(new Set(['users', 'accounts', 'sessions', 'verifications']));
    expect(columns.filter((c) => /password/i.test(c.column_name))).toEqual([]);
  });
});
