// WAT-141/142/143 — the history of an MCP: its versions, newest first, read by its own workspace only.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { readMcpHistory } from './mcp-versions';
import { createHostedStore, type HostedStore } from './hosted-store';
import type { HostedMcpConfig } from './hosted-mcp-factory';
import { openDatabase, type Database } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { DATABASE_TEST_TIMEOUTS, createTestDatabase, type TestDatabase } from '../db/test-database';
import { createTestAccount } from '../db/test-account';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

const MONDAY = new Date('2026-10-19T08:30:00.000Z');
const TUESDAY = new Date('2026-10-20T14:00:00.000Z');

const NOTION: HostedMcpConfig = {
  name: 'notion',
  apiName: 'Notion API',
  baseUrl: 'https://api.notion.com/v1',
  upstreamAuth: { type: 'bearer' },
  endpoints: [
    { name: 'search', label: 'Search', description: 'Search', method: 'POST', path: '/search', params: [] },
    { name: 'get_a_page', label: 'Get a page', description: 'Get a page', method: 'GET', path: '/pages/{id}', params: [] },
  ],
};

let testDb: TestDatabase;
let database: Database;
let store: HostedStore;

beforeAll(async () => {
  testDb = await createTestDatabase();
  database = openDatabase(testDb.config);
  await migrateDatabase(database);
  store = createHostedStore(database);
});

afterAll(async () => {
  await database?.close();
  await testDb?.dispose();
});

/** "Save" comes with the next delivery: version 2, holding the page reading only, is made active at `at`. */
async function activateVersion2(id: string, at: Date): Promise<void> {
  await database.rows(sql`update connector_versions set active_since = null where connector_id = ${id}`);
  await database.rows(
    sql`insert into connector_versions (connector_id, number, created_at, active_since) values (${id}, 2, ${at}, ${at})`
  );
  await database.rows(
    sql`insert into connector_actions (connector_id, version, position, name, label, description, method, path, params)
        values (${id}, 2, 0, 'get_a_page', 'Get a page', 'Get a page', 'GET', '/pages/{id}', '[]'::jsonb)`
  );
}

describe('the history of an MCP', () => {
  it('lists its versions newest first, each with its actions, the active one dated from its activation (D8)', async () => {
    const { workspaceId } = await createTestAccount({ database, email: 'history@example.com' });
    const { id } = await store.put(NOTION, workspaceId, MONDAY);
    await activateVersion2(id, TUESDAY);

    expect(await readMcpHistory(database, id)).toEqual({
      apiName: 'Notion API',
      versions: [
        {
          number: 2,
          createdAt: '2026-10-20T14:00:00.000Z',
          activeSince: '2026-10-20T14:00:00.000Z',
          actionLabels: ['Get a page'],
        },
        { number: 1, createdAt: '2026-10-19T08:30:00.000Z', activeSince: null, actionLabels: ['Search', 'Get a page'] },
      ],
    });
  });
});
