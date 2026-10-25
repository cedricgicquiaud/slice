// WAT-103/104/105 — an account finds the MCPs of its workspace, and deletes one; never another account's.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAccountMcps } from './account-mcps';
import { createHostedStore, type HostedStore } from './hosted-store';
import type { HostedEndpoint, HostedMcpConfig } from './hosted-mcp-factory';
import { openDatabase, type Database } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { createTestDatabase, type TestDatabase } from '../db/test-database';
import { createTestAccount } from '../db/test-account';

const MONDAY = new Date('2026-10-19T08:30:00.000Z');
const TUESDAY = new Date('2026-10-20T14:00:00.000Z');

function action(name: string): HostedEndpoint {
  return { name, description: name, method: 'GET', path: `/${name}`, params: [] };
}

function mcp(over: Partial<HostedMcpConfig> & { actions: number }): HostedMcpConfig {
  const { actions, ...rest } = over;
  return {
    name: 'mcp',
    baseUrl: 'https://api.example.com/v1',
    upstreamAuth: { type: 'bearer' },
    endpoints: Array.from({ length: actions }, (_, i) => action(`action_${i}`)),
    ...rest,
  };
}

describe('the MCPs of an account', () => {
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

  it("lists the workspace's MCPs, newest first, with the API's name, action count and creation date", async () => {
    const { workspaceId } = await createTestAccount({ database, email: 'two@example.com' });
    const notion = await store.put(mcp({ apiName: 'Notion API', actions: 3 }), workspaceId, MONDAY);
    const stripe = await store.put(mcp({ apiName: 'Stripe', actions: 1 }), workspaceId, TUESDAY);

    expect(await createAccountMcps(database).list(workspaceId)).toEqual([
      { id: stripe.id, apiName: 'Stripe', actionCount: 1, createdAt: '2026-10-20T14:00:00.000Z' },
      { id: notion.id, apiName: 'Notion API', actionCount: 3, createdAt: '2026-10-19T08:30:00.000Z' },
    ]);
  });

  it("never lists another account's MCPs (contract 17)", async () => {
    const mine = await createTestAccount({ database, email: 'mine@example.com' });
    const theirs = await createTestAccount({ database, email: 'theirs@example.com' });
    const kept = await store.put(mcp({ apiName: 'Mine', actions: 1 }), mine.workspaceId, MONDAY);
    await store.put(mcp({ apiName: 'Theirs', actions: 1 }), theirs.workspaceId, TUESDAY);

    const listed = await createAccountMcps(database).list(mine.workspaceId);

    expect(listed.map((m) => m.id)).toEqual([kept.id]);
  });

  it("names an MCP without an API name after its API's domain (D9)", async () => {
    const { workspaceId } = await createTestAccount({ database, email: 'nameless@example.com' });
    await store.put(mcp({ baseUrl: 'https://api.acme.io/v2', actions: 1 }), workspaceId, MONDAY);

    const [listed] = await createAccountMcps(database).list(workspaceId);

    expect(listed?.apiName).toBe('api.acme.io');
  });
});
