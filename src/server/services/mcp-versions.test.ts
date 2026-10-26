// WAT-141/142/143 — the history of an MCP: its versions, newest first, read by its own workspace only.
// WAT-148/149 — "Restore": an existing version of one's own MCP becomes the active one again.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { readMcpHistory, restoreMcpVersion } from './mcp-versions';
import { saveMcpSelection } from './mcp-selection';
import { createHostedStore, type HostedStore } from './hosted-store';
import type { HostedMcpConfig } from './hosted-mcp-factory';
import { openDatabase, type Database } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { DATABASE_TEST_TIMEOUTS, createTestDatabase, type TestDatabase } from '../db/test-database';
import { createTestAccount } from '../db/test-account';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

const MONDAY = new Date('2026-10-19T08:30:00.000Z');
const TUESDAY = new Date('2026-10-20T14:00:00.000Z');
const WEDNESDAY = new Date('2026-10-21T16:45:00.000Z');

const NOTION: HostedMcpConfig = {
  name: 'notion',
  apiName: 'Notion API',
  baseUrl: 'https://api.notion.com/v1',
  upstreamAuth: { type: 'bearer' },
  endpoints: [
    { name: 'search', label: 'Search', description: 'Search', method: 'POST', path: '/search', params: [] },
    { name: 'get_a_page', label: 'Get a page', description: 'Get a page', method: 'GET', path: '/pages/{id}', params: [] },
  ],
  apiActions: [
    { name: 'search', label: 'Search', group: 'Search', deprecated: false, method: 'POST', path: '/search', params: [] },
    { name: 'get_a_page', label: 'Get a page', group: 'Pages', deprecated: false, method: 'GET', path: '/pages/{id}', params: [] },
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

    expect(await readMcpHistory(database, workspaceId, id)).toEqual({
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

  it('reads the MCP as it stands at one moment: while it is deleted, either its whole history or no MCP at all', async () => {
    const { workspaceId } = await createTestAccount({ database, email: 'history-race@example.com' });
    const { id } = await store.put(NOTION, workspaceId, MONDAY);

    const [history] = await Promise.all([
      readMcpHistory(database, workspaceId, id),
      database.rows(sql`delete from connectors where id = ${id}`),
    ]);

    expect([
      undefined,
      {
        apiName: 'Notion API',
        versions: [
          {
            number: 1,
            createdAt: '2026-10-19T08:30:00.000Z',
            activeSince: '2026-10-19T08:30:00.000Z',
            actionLabels: ['Search', 'Get a page'],
          },
        ],
      },
    ]).toContainEqual(history);
  });
});

describe('"Restore"', () => {
  it('makes version 1 the active one again, active from now, without creating a version (contract 10, D9)', async () => {
    const { workspaceId } = await createTestAccount({ database, email: 'restore@example.com' });
    const { id } = await store.put(NOTION, workspaceId, MONDAY);
    await activateVersion2(id, TUESDAY);

    const outcome = await restoreMcpVersion(database, workspaceId, id, 1, WEDNESDAY);

    expect({ outcome, history: await readMcpHistory(database, workspaceId, id) }).toEqual({
      outcome: { activeSince: '2026-10-21T16:45:00.000Z' },
      history: {
        apiName: 'Notion API',
        versions: [
          { number: 2, createdAt: '2026-10-20T14:00:00.000Z', activeSince: null, actionLabels: ['Get a page'] },
          {
            number: 1,
            createdAt: '2026-10-19T08:30:00.000Z',
            activeSince: '2026-10-21T16:45:00.000Z',
            actionLabels: ['Search', 'Get a page'],
          },
        ],
      },
    });
  });

  it("refuses another account's MCP as an unknown one, and leaves its active version as it is (contract 19, D12)", async () => {
    const owner = await createTestAccount({ database, email: 'restore-owner@example.com' });
    const neighbour = await createTestAccount({ database, email: 'restore-neighbour@example.com' });
    const { id } = await store.put(NOTION, owner.workspaceId, MONDAY);
    await activateVersion2(id, TUESDAY);

    const outcome = await restoreMcpVersion(database, neighbour.workspaceId, id, 1, WEDNESDAY);

    expect({
      outcome,
      active: (await readMcpHistory(database, owner.workspaceId, id))?.versions.map((version) => version.activeSince),
    }).toEqual({ outcome: { refused: 'unknown-mcp' }, active: ['2026-10-20T14:00:00.000Z', null] });
  });

  it('refuses a version the MCP does not have, and leaves its active version as it is (contract 21)', async () => {
    const { workspaceId } = await createTestAccount({ database, email: 'restore-missing@example.com' });
    const { id } = await store.put(NOTION, workspaceId, MONDAY);
    await activateVersion2(id, TUESDAY);

    const outcome = await restoreMcpVersion(database, workspaceId, id, 7, WEDNESDAY);

    expect({
      outcome,
      active: (await readMcpHistory(database, workspaceId, id))?.versions.map((version) => version.activeSince),
    }).toEqual({ outcome: { refused: 'unknown-version' }, active: ['2026-10-20T14:00:00.000Z', null] });
  });

  it('restores the active version without changing anything, not even its "Active since" date (contract 12, D9)', async () => {
    const { workspaceId } = await createTestAccount({ database, email: 'restore-active@example.com' });
    const { id } = await store.put(NOTION, workspaceId, MONDAY);
    await activateVersion2(id, TUESDAY);

    const outcome = await restoreMcpVersion(database, workspaceId, id, 2, WEDNESDAY);

    expect({
      outcome,
      active: (await readMcpHistory(database, workspaceId, id))?.versions.map((version) => version.activeSince),
    }).toEqual({ outcome: { activeSince: '2026-10-20T14:00:00.000Z' }, active: ['2026-10-20T14:00:00.000Z', null] });
  });

  it('never leaves two active versions when a "Restore" and a "Save" of the same MCP run at once', async () => {
    // A real race on PostgreSQL only (`DATABASE_URL`): PGlite's single connection runs the two one after the other.
    // Played twenty times: without the lock, a single run would pass part of the time.
    const { workspaceId } = await createTestAccount({ database, email: 'restore-race@example.com' });

    for (let round = 0; round < 20; round += 1) {
      const { id } = await store.put(NOTION, workspaceId, MONDAY);
      await activateVersion2(id, TUESDAY);

      const [, saved] = await Promise.all([
        restoreMcpVersion(database, workspaceId, id, 1, WEDNESDAY),
        saveMcpSelection(database, workspaceId, id, { fromVersion: 2, selectedIds: ['POST /search'] }, WEDNESDAY),
      ]);
      const history = await readMcpHistory(database, workspaceId, id);

      // Whichever runs first, version 1 ends up the only active one: "Save" is refused after
      // the "Restore", or its version 3 is replaced by the "Restore" that follows it.
      expect([
        { round, saved: { version: 3 }, active: [1] },
        { round, saved: { refused: 'changed-meanwhile' }, active: [1] },
      ]).toContainEqual({
        round,
        saved,
        active: history?.versions.filter((version) => version.activeSince !== null).map((version) => version.number),
      });
    }
  });
});
