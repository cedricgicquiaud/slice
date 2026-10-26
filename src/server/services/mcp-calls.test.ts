// WAT-154 — an MCP keeps the note of each action call, and nothing else (D3, D4, D14).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createMcpCalls, type CallNote } from './mcp-calls';
import { createHostedStore } from './hosted-store';
import { createAccountMcps } from './account-mcps';
import type { HostedMcpConfig } from './hosted-mcp-factory';
import { openDatabase, type Database } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { DATABASE_TEST_TIMEOUTS, createTestDatabase, type TestDatabase } from '../db/test-database';
import { createTestAccount } from '../db/test-account';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

const NOW = new Date('2026-10-26T09:00:00.000Z');
const SLICE_PAGE = 'http://localhost:5173';

const contacts: HostedMcpConfig = {
  name: 'crm',
  baseUrl: 'https://api.example.com/v1',
  upstreamAuth: { type: 'bearer' },
  endpoints: [{ name: 'list_contacts', description: 'List contacts', method: 'GET', path: '/contacts', params: [] }],
  apiActions: [
    { name: 'list_contacts', label: 'List contacts', group: 'Contacts', deprecated: false, method: 'GET', path: '/contacts', params: [] },
  ],
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

/** A call of `list_contacts` on version 1, `minutes` after NOW, with `result`. */
function callAt(minutes: number, result: CallNote['result'], durationMs = 120): CallNote {
  return { action: 'list_contacts', version: 1, calledAt: new Date(NOW.getTime() + minutes * 60_000), result, durationMs };
}

describe('the notes of action calls', () => {
  it('reads back each written note, whatever its result among the six, oldest first (D3, D4)', async () => {
    const { id } = await createHostedStore(database).put(contacts, workspaceId, NOW);
    const calls = createMcpCalls(database);
    const notes = [
      callAt(0, { kind: 'succeeded' }),
      callAt(1, { kind: 'failed', status: 404 }),
      callAt(2, { kind: 'api_unreachable' }),
      callAt(3, { kind: 'invalid_request' }),
      callAt(4, { kind: 'not_available' }),
      callAt(5, { kind: 'slice_error' }, 7),
    ];

    await calls.write(id, notes);

    expect(await calls.of(id)).toEqual(notes);
  });

  it('are deleted with their MCP (contract 14, D14)', async () => {
    const { id } = await createHostedStore(database).put(contacts, workspaceId, NOW);
    const calls = createMcpCalls(database);
    await calls.write(id, [callAt(0, { kind: 'succeeded' })]);

    await createAccountMcps(database).delete(workspaceId, id);

    expect(await calls.of(id)).toEqual([]);
  });

  it('are deleted with the account that owns their MCP (contract 14, D14)', async () => {
    const leaving = await createTestAccount({ database, email: 'leaving@example.com' });
    const { id } = await createHostedStore(database).put(contacts, leaving.workspaceId, NOW);
    const calls = createMcpCalls(database);
    await calls.write(id, [callAt(0, { kind: 'succeeded' })]);

    const res = await leaving.auth.handler(
      new Request(`${SLICE_PAGE}/api/auth/delete-user`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: leaving.cookie, origin: SLICE_PAGE },
        body: '{}',
      })
    );

    expect({ status: res.status, notes: await calls.of(id) }).toEqual({ status: 200, notes: [] });
  });
});
