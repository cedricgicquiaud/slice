// WAT-160 — the usage of an MCP over the last 30 days, by action.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readMcpUsage } from './mcp-usage';
import { createMcpCalls, type CallNote } from './mcp-calls';
import { createHostedStore, type HostedStore } from './hosted-store';
import type { HostedMcpConfig } from './hosted-mcp-factory';
import { openDatabase, type Database } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { DATABASE_TEST_TIMEOUTS, createTestDatabase, type TestDatabase } from '../db/test-database';
import { createTestAccount } from '../db/test-account';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

const CREATED = new Date('2026-09-01T08:00:00.000Z');
const NOW = new Date('2026-10-26T14:00:00.000Z');

/** The Notes API: its version 1 holds three actions; "Empty the trash" stays unchecked. */
const NOTES: HostedMcpConfig = {
  name: 'notes',
  apiName: 'Notes API',
  baseUrl: 'https://notes.example.com/v1',
  upstreamAuth: { type: 'bearer' },
  endpoints: [
    { name: 'list_notes', label: 'List notes', description: 'List notes', method: 'GET', path: '/notes', params: [] },
    { name: 'create_note', label: 'Create a note', description: 'Create a note', method: 'POST', path: '/notes', params: [] },
    { name: 'delete_note', label: 'Delete a note', description: 'Delete a note', method: 'DELETE', path: '/notes/{id}', params: [] },
  ],
  apiActions: [
    { name: 'list_notes', label: 'List notes', group: 'Notes', deprecated: false, method: 'GET', path: '/notes', params: [] },
    { name: 'create_note', label: 'Create a note', group: 'Notes', deprecated: false, method: 'POST', path: '/notes', params: [] },
    { name: 'delete_note', label: 'Delete a note', group: 'Notes', deprecated: false, method: 'DELETE', path: '/notes/{id}', params: [] },
    { name: 'empty_trash', label: 'Empty the trash', group: 'Trash', deprecated: false, method: 'DELETE', path: '/trash', params: [] },
  ],
};

let testDb: TestDatabase;
let database: Database;
let store: HostedStore;
let workspaceId: string;

beforeAll(async () => {
  testDb = await createTestDatabase();
  database = openDatabase(testDb.config);
  await migrateDatabase(database);
  store = createHostedStore(database);
  ({ workspaceId } = await createTestAccount({ database }));
});

afterAll(async () => {
  await database?.close();
  await testDb?.dispose();
});

/** A call of `action` on version 1, `hours` before NOW. */
function call(action: string, hours: number, result: CallNote['result'], durationMs: number): CallNote {
  return { action, version: 1, calledAt: new Date(NOW.getTime() - hours * 3_600_000), result, durationMs };
}

describe('the usage of an MCP', () => {
  it("counts each active action's calls and successes, averages the successes' duration, dates its last call (contract 8, 9, D10)", async () => {
    const { id } = await store.put(NOTES, workspaceId, CREATED);
    await createMcpCalls(database).write(id, [
      call('list_notes', 50, { kind: 'succeeded' }, 200),
      call('list_notes', 30, { kind: 'failed', status: 404 }, 900),
      call('list_notes', 2, { kind: 'succeeded' }, 400),
    ]);

    const usage = await readMcpUsage(database, workspaceId, id, NOW);

    expect(usage?.actions).toEqual([
      {
        name: 'list_notes',
        label: 'List notes',
        available: true,
        calls: 3,
        succeeded: 2,
        averageDurationMs: 300,
        lastCalledAt: '2026-10-26T12:00:00.000Z',
      },
      { name: 'create_note', label: 'Create a note', available: true, calls: 0, succeeded: 0, averageDurationMs: null, lastCalledAt: null },
      { name: 'delete_note', label: 'Delete a note', available: true, calls: 0, succeeded: 0, averageDurationMs: null, lastCalledAt: null },
    ]);
  });

  it('leaves a call made more than 30 days ago out of every figure (contract 20, D9)', async () => {
    const { id } = await store.put(NOTES, workspaceId, CREATED);
    await createMcpCalls(database).write(id, [
      call('list_notes', 31 * 24, { kind: 'succeeded' }, 5_000),
      call('list_notes', 29 * 24, { kind: 'succeeded' }, 100),
    ]);

    const usage = await readMcpUsage(database, workspaceId, id, NOW);

    expect(usage?.actions[0]).toEqual({
      name: 'list_notes',
      label: 'List notes',
      available: true,
      calls: 1,
      succeeded: 1,
      averageDurationMs: 100,
      lastCalledAt: '2026-09-27T14:00:00.000Z',
    });
  });

  it("adds a line, not available, for an API's action outside the active version called in the last 30 days (contract 6, D10)", async () => {
    const { id } = await store.put(NOTES, workspaceId, CREATED);
    await createMcpCalls(database).write(id, [call('empty_trash', 5, { kind: 'not_available' }, 3)]);

    const usage = await readMcpUsage(database, workspaceId, id, NOW);

    expect(usage?.actions.filter((action) => !action.available)).toEqual([
      {
        name: 'empty_trash',
        label: 'Empty the trash',
        available: false,
        calls: 1,
        succeeded: 0,
        averageDurationMs: null,
        lastCalledAt: '2026-10-26T09:00:00.000Z',
      },
    ]);
  });

  it('names each day of the last 30 on which 10,000 calls were noted, and only those (contract 19, D8)', async () => {
    const { id } = await store.put(NOTES, workspaceId, CREATED);
    /** `count` calls on `day`, a second apart from its midnight (UTC). */
    const callsOn = (day: string, count: number): CallNote[] =>
      Array.from({ length: count }, (_, n) => ({
        action: 'list_notes',
        version: 1,
        calledAt: new Date(Date.parse(`${day}T00:00:00.000Z`) + n * 1_000),
        result: { kind: 'succeeded' },
        durationMs: 50,
      }));
    await createMcpCalls(database).write(id, [...callsOn('2026-10-24', 10_000), ...callsOn('2026-10-25', 9_999)]);

    const usage = await readMcpUsage(database, workspaceId, id, NOW);

    expect(usage?.cappedDays).toEqual(['2026-10-24']);
  });
});
