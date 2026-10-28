// WAT-169 — the key of an MCP is kept encrypted, one per MCP, and leaves with it or with its account (D3, D4, D12, D14).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createMcpApiKeys } from './mcp-api-key';
import { createKeyCipher } from './key-cipher';
import { createHostedStore } from './hosted-store';
import { createAccountMcps } from './account-mcps';
import type { HostedMcpConfig } from './hosted-mcp-factory';
import { openDatabase, type Database } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { DATABASE_TEST_TIMEOUTS, createTestDatabase, type TestDatabase } from '../db/test-database';
import { createTestAccount } from '../db/test-account';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

const NOW = new Date('2026-10-28T09:00:00.000Z');
const SLICE_PAGE = 'http://localhost:5173';

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

  it('is dated from its last saving, a replacement included (D3)', async () => {
    const { id } = await createHostedStore(database).put(notion, workspaceId, NOW);
    const keys = createMcpApiKeys(database, createKeyCipher(randomBytes(32)));
    await keys.save(id, 'secret_ntn_first', NOW);

    await keys.save(id, 'secret_ntn_second', new Date('2026-10-29T14:30:00.000Z'));

    expect(await keys.stateOf(id)).toEqual({ savedAt: new Date('2026-10-29T14:30:00.000Z'), readable: true });
  });

  it('removed leaves the database, the MCP having no key any more (D3)', async () => {
    const { id } = await createHostedStore(database).put(notion, workspaceId, NOW);
    const keys = createMcpApiKeys(database, createKeyCipher(randomBytes(32)));
    await keys.save(id, 'secret_ntn_first', NOW);

    await keys.remove(id);

    expect({ state: await keys.stateOf(id), lines: (await rawLinesOf(id)).length }).toEqual({ state: undefined, lines: 0 });
  });

  it('is read for its MCP only, never for another MCP of the same account (contract 19, D4)', async () => {
    const store = createHostedStore(database);
    const withKey = await store.put(notion, workspaceId, NOW);
    const withoutKey = await store.put(notion, workspaceId, NOW);
    const keys = createMcpApiKeys(database, createKeyCipher(randomBytes(32)));

    await keys.save(withKey.id, 'secret_ntn_first', NOW);

    expect({ key: await keys.keyOf(withoutKey.id), state: await keys.stateOf(withoutKey.id) }).toEqual({
      key: undefined,
      state: undefined,
    });
  });

  it('encrypted under another encryption key is told unreadable, never decrypted into a wrong text (contract 21, D3)', async () => {
    const { id } = await createHostedStore(database).put(notion, workspaceId, NOW);
    await createMcpApiKeys(database, createKeyCipher(randomBytes(32))).save(id, 'secret_ntn_first', NOW);

    const keys = createMcpApiKeys(database, createKeyCipher(randomBytes(32)));

    expect({ key: await keys.keyOf(id), state: await keys.stateOf(id) }).toEqual({
      key: { unreadable: true },
      state: { savedAt: NOW, readable: false },
    });
  });

  it('leaves with its MCP (contract 11, D14)', async () => {
    const { id } = await createHostedStore(database).put(notion, workspaceId, NOW);
    await createMcpApiKeys(database, createKeyCipher(randomBytes(32))).save(id, 'secret_ntn_first', NOW);

    await createAccountMcps(database).delete(workspaceId, id);

    expect(await rawLinesOf(id)).toEqual([]);
  });

  it('leaves with the account that owns its MCP (contract 11, D14)', async () => {
    const leaving = await createTestAccount({ database, email: 'leaving@example.com' });
    const { id } = await createHostedStore(database).put(notion, leaving.workspaceId, NOW);
    await createMcpApiKeys(database, createKeyCipher(randomBytes(32))).save(id, 'secret_ntn_first', NOW);

    const res = await leaving.auth.handler(
      new Request(`${SLICE_PAGE}/api/auth/delete-user`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: leaving.cookie, origin: SLICE_PAGE },
        body: '{}',
      })
    );

    expect({ status: res.status, lines: await rawLinesOf(id) }).toEqual({ status: 200, lines: [] });
  });

  it('saved twice at once leaves a single key, played twenty times (D4)', async () => {
    // A real race on PostgreSQL only (`DATABASE_URL`): PGlite's single connection runs the two one after the other.
    const store = createHostedStore(database);
    const keys = createMcpApiKeys(database, createKeyCipher(randomBytes(32)));
    const lines: number[] = [];
    for (let round = 0; round < 20; round += 1) {
      const { id } = await store.put(notion, workspaceId, NOW);

      await Promise.all([keys.save(id, 'secret_ntn_first', NOW), keys.save(id, 'secret_ntn_second', NOW)]);
      lines.push((await rawLinesOf(id)).length);
    }

    expect(lines).toEqual(Array.from({ length: 20 }, () => 1));
  });
});
