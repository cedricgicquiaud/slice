// WAT-62 — the two tables follow the feature's schema (D3).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { openDatabase, type Database } from './client';
import { migrateDatabase } from './migrate';
import { DATABASE_TEST_TIMEOUTS, createTestDatabase, type TestDatabase } from './test-database';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

let testDb: TestDatabase;
let database: Database;

beforeAll(async () => {
  testDb = await createTestDatabase();
  database = openDatabase(testDb.config);
  await migrateDatabase(database);
  await rows(sql`insert into users (id, name, email) values ('owner', '', 'owner@example.com')`);
  await rows(sql`insert into workspaces (id, owner_id, created_at) values ('owner-workspace', 'owner', now())`);
});

afterAll(async () => {
  await database?.close();
  await testDb?.dispose();
});

function rows<T>(query: SQL): Promise<T[]> {
  return database.rows<T>(query);
}

function insertVersion(connectorId: string, number: number, active: boolean) {
  return rows(
    sql`insert into connector_versions (connector_id, number, created_at, active_since)
        values (${connectorId}, ${number}, now(), ${active ? sql`now()` : null})`
  );
}

function insertApiAction(connectorId: string, position: number) {
  return rows(
    sql`insert into connector_api_actions (connector_id, position, name, label, group_name, deprecated, method, path, params)
        values (${connectorId}, ${position}, 'ping', 'Ping', 'Health', false, 'GET', '/ping', '[]'::jsonb)`
  );
}

/** What is left of a connector's history: its versions, their actions, its API's full list. */
function leftOf(connectorId: string) {
  return rows<{ kind: string }>(
    sql`select 'version' as kind from connector_versions where connector_id = ${connectorId}
        union all select 'action' from connector_actions where connector_id = ${connectorId}
        union all select 'api action' from connector_api_actions where connector_id = ${connectorId}`
  );
}

describe('database schema (D3)', () => {
  it('creates connectors, connector_actions and workspaces with the columns of the schema', async () => {
    const columns = await rows<{ table_name: string; column_name: string; udt_name: string; is_nullable: string }>(
      sql`select table_name, column_name, udt_name, is_nullable
          from information_schema.columns
          where table_schema = 'public' and table_name in ('connectors', 'connector_actions', 'workspaces')
          order by table_name, ordinal_position`
    );

    expect(columns.map((c) => `${c.table_name}.${c.column_name} ${c.udt_name} ${c.is_nullable}`)).toEqual([
      'connector_actions.connector_id text NO',
      'connector_actions.version int4 NO',
      'connector_actions.position int4 NO',
      'connector_actions.name text NO',
      'connector_actions.label text NO',
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
      'connectors.workspace_id text NO',
      'connectors.api_name text YES',
      'workspaces.id text NO',
      'workspaces.owner_id text NO',
      'workspaces.created_at timestamptz NO',
    ]);
  });

  it("creates a connector's versions and the full list of its API's actions (D1, D4, D9)", async () => {
    const columnsOf = async (table: string) =>
      (
        await rows<{ column_name: string; udt_name: string; is_nullable: string }>(
          sql`select column_name, udt_name, is_nullable from information_schema.columns
              where table_schema = 'public' and table_name = ${table} order by ordinal_position`
        )
      ).map((c) => `${c.column_name} ${c.udt_name} ${c.is_nullable}`);

    expect({
      versions: await columnsOf('connector_versions'),
      apiActions: await columnsOf('connector_api_actions'),
    }).toEqual({
      versions: ['connector_id text NO', 'number int4 NO', 'created_at timestamptz NO', 'active_since timestamptz YES'],
      apiActions: [
        'connector_id text NO',
        'position int4 NO',
        'name text NO',
        'label text NO',
        'group_name text NO',
        'description text YES',
        'deprecated bool NO',
        'method http_method NO',
        'path text NO',
        'params jsonb NO',
      ],
    });
  });

  it("keeps of an action call its action, the active version, the date, the result and the duration, its order of writing and nothing else (WAT-154, D3, contract 17)", async () => {
    const columns = await rows<{ column_name: string; udt_name: string; is_nullable: string }>(
      sql`select column_name, udt_name, is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = 'connector_calls' order by ordinal_position`
    );

    expect(columns.map((c) => `${c.column_name} ${c.udt_name} ${c.is_nullable}`)).toEqual([
      'id int8 NO',
      'connector_id text NO',
      'version int4 NO',
      'action text NO',
      'called_at timestamptz NO',
      'result call_result NO',
      'status int4 YES',
      'duration_ms int4 NO',
    ]);
  });

  it("keeps of an MCP's key its MCP, the encrypted value and the date it was saved, and nothing else (WAT-169, D3, D12)", async () => {
    const columns = await rows<{ column_name: string; udt_name: string; is_nullable: string }>(
      sql`select column_name, udt_name, is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = 'connector_keys' order by ordinal_position`
    );

    expect(columns.map((c) => `${c.column_name} ${c.udt_name} ${c.is_nullable}`)).toEqual([
      'connector_id text NO',
      'encrypted_key text NO',
      'saved_at timestamptz NO',
    ]);
  });

  it("keeps the API's status code of a failed call, and of a failed call only (D4)", async () => {
    await insertConnector('noted', 'none', null, null);
    await insertVersion('noted', 1, true);
    const insertCall = (result: string, status: number | null) =>
      rows(
        sql`insert into connector_calls (connector_id, version, action, called_at, result, status, duration_ms)
            values ('noted', 1, 'ping', now(), ${result}, ${status}, 12)`
      );

    await expect(insertCall('failed', null)).rejects.toThrow();
    await expect(insertCall('succeeded', 200)).rejects.toThrow();
    await expect(insertCall('failed', 404)).resolves.toBeDefined();
  });

  function insertConnector(id: string, authType: string, headerName: string | null, tokenUrl: string | null) {
    return rows(
      sql`insert into connectors (id, name, base_url, upstream_auth_type, upstream_header_name, upstream_token_url, created_at, workspace_id)
          values (${id}, 'demo', 'https://api.example.com', ${authType}, ${headerName}, ${tokenUrl}, now(), 'owner-workspace')`
    );
  }

  it('refuses a connector that belongs to no workspace (D17)', async () => {
    await expect(
      rows(
        sql`insert into connectors (id, name, base_url, upstream_auth_type, created_at)
            values ('ownerless', 'demo', 'https://api.example.com', 'none', now())`
      )
    ).rejects.toThrow();
  });

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
      sql`insert into connector_actions (connector_id, version, position, name, label, description, method, path, params)
          values (${connectorId}, 1, ${position}, 'ping', 'Ping', 'Ping', 'GET', '/ping', '[]'::jsonb)`
    );
  }

  it('deletes the actions of a deleted connector', async () => {
    await insertConnector('cascade', 'none', null, null);
    await insertVersion('cascade', 1, true);
    await insertAction('cascade', 0);

    await rows(sql`delete from connectors where id = 'cascade'`);

    expect(await rows(sql`select 1 from connector_actions where connector_id = 'cascade'`)).toEqual([]);
  });

  it('deletes the versions and the full list of actions of a deleted connector (contract 13)', async () => {
    await insertConnector('cascade-history', 'none', null, null);
    await insertVersion('cascade-history', 1, true);
    await insertAction('cascade-history', 0);
    await insertApiAction('cascade-history', 0);

    await rows(sql`delete from connectors where id = 'cascade-history'`);

    expect(await leftOf('cascade-history')).toEqual([]);
  });

  it('refuses a second active version of a connector, never an inactive one (D4)', async () => {
    await insertConnector('one-active', 'none', null, null);
    await insertVersion('one-active', 1, true);
    await insertVersion('one-active', 2, false);
    await insertVersion('one-active', 3, false);

    await expect(insertVersion('one-active', 4, true)).rejects.toThrow();
  });

  it('refuses an action of a version the connector does not have', async () => {
    await insertConnector('versionless', 'none', null, null);

    await expect(insertAction('versionless', 0)).rejects.toThrow();
  });

  it('refuses two actions at the same position of a connector', async () => {
    await insertConnector('positions', 'none', null, null);
    await insertVersion('positions', 1, true);
    await insertAction('positions', 0);

    await expect(insertAction('positions', 0)).rejects.toThrow();
  });

  it('indexes connectors by creation date', async () => {
    const indexes = await rows<{ indexdef: string }>(
      sql`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'connectors'`
    );

    expect(indexes.some((i) => /\(created_at\)$/.test(i.indexdef))).toBe(true);
  });

  it("indexes the notes of calls by MCP, then by date", async () => {
    const indexes = await rows<{ indexdef: string }>(
      sql`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'connector_calls'`
    );

    expect(indexes.some((i) => /\(connector_id, called_at\)$/.test(i.indexdef))).toBe(true);
  });
});

describe('deleting an account (WAT-101)', () => {
  it('deletes its workspace, its connectors, their versions and their lists of actions with it (D11, contract 13)', async () => {
    await rows(sql`insert into users (id, name, email) values ('leaving', '', 'leaving@example.com')`);
    await rows(sql`insert into workspaces (id, owner_id, created_at) values ('leaving-workspace', 'leaving', now())`);
    await rows(
      sql`insert into connectors (id, name, base_url, upstream_auth_type, created_at, workspace_id)
          values ('leaving-mcp', 'demo', 'https://api.example.com', 'none', now(), 'leaving-workspace')`
    );
    await insertVersion('leaving-mcp', 1, true);
    await rows(
      sql`insert into connector_actions (connector_id, version, position, name, label, description, method, path, params)
          values ('leaving-mcp', 1, 0, 'ping', 'Ping', 'Ping', 'GET', '/ping', '[]'::jsonb)`
    );
    await insertApiAction('leaving-mcp', 0);

    await rows(sql`delete from users where id = 'leaving'`);

    const left = await rows<{ kind: string }>(
      sql`select 'workspace' as kind from workspaces where id = 'leaving-workspace'
          union all select 'connector' from connectors where id = 'leaving-mcp'`
    );
    expect([...left, ...(await leftOf('leaving-mcp'))]).toEqual([]);
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
