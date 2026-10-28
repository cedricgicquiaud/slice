// WAT-169 — the key of an MCP is kept encrypted, one per MCP, and leaves with it or with its account (D3, D4, D12, D14).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createMcpApiKeys } from './mcp-api-key';
import { createKeyCipher } from './key-cipher';
import { createHostedStore } from './hosted-store';
import type { HostedMcpConfig } from './hosted-mcp-factory';
import { openDatabase, type Database } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { DATABASE_TEST_TIMEOUTS, createTestDatabase, type TestDatabase } from '../db/test-database';
import { createTestAccount } from '../db/test-account';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

const NOW = new Date('2026-10-28T09:00:00.000Z');

const notion: HostedMcpConfig = {
  name: 'notion',
  baseUrl: 'https://api.notion.com/v1',
  upstreamAuth: { type: 'bearer' },
  endpoints: [{ name: 'search', description: 'Search', method: 'POST', path: '/search', params: [] }],
  apiActions: [{ name: 'search', label: 'Search', group: 'Search', deprecated: false, method: 'POST', path: '/search', params: [] }],
};

let testDb: TestDatabase;
let database: Database;
let workspaceId: string;

beforeAll(async () => {
  testDb = await createTestDatabase();
  database = openDatabase(testDb.config);
  await migrateDatabase(database);
  ({ workspaceId } = await createTestAccount({ database }));
});

afterAll(async () => {
  await database?.close();
  await testDb?.dispose();
});

/** A key of 40 characters drawn at random: found only where it was written. */
function randomApiKey(): string {
  return randomBytes(30).toString('base64url');
}

/** Each line of the table of keys for the MCP `id`, every column as text: what reading the database shows. */
function rawLinesOf(id: string) {
  return database.rows<{ line: string }>(sql`select k::text as line from connector_keys k where connector_id = ${id}`);
}

describe('the key of an MCP', () => {
  it('is kept as one line where the key never appears in clear (contract 12, D12)', async () => {
    const { id } = await createHostedStore(database).put(notion, workspaceId, NOW);
    const apiKey = randomApiKey();

    await createMcpApiKeys(database, createKeyCipher(randomBytes(32))).save(id, apiKey, NOW);

    expect((await rawLinesOf(id)).map(({ line }) => line.includes(apiKey))).toEqual([false]);
  });

  it('saved again replaces the one before, which leaves the database (D3, D4)', async () => {
    const { id } = await createHostedStore(database).put(notion, workspaceId, NOW);
    const keys = createMcpApiKeys(database, createKeyCipher(randomBytes(32)));
    await keys.save(id, 'secret_ntn_first', NOW);

    await keys.save(id, 'secret_ntn_second', NOW);

    expect({ key: await keys.keyOf(id), lines: (await rawLinesOf(id)).length }).toEqual({
      key: { key: 'secret_ntn_second' },
      lines: 1,
    });
  });
});
