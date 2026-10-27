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

  it('read back in the order they were written when they share their date, as the calls of one request do (D6)', async () => {
    const { id } = await createHostedStore(database).put(contacts, workspaceId, NOW);
    const calls = createMcpCalls(database);
    // A request a minute after NOW is written before one arriving at NOW, whose answer took longer.
    // Each carries twenty calls sharing its arrival date; their duration tells them apart.
    const later = Array.from({ length: 20 }, (_, n) => callAt(1, { kind: 'succeeded' }, 100 + n));
    const earlier = Array.from({ length: 20 }, (_, n) => callAt(0, { kind: 'succeeded' }, n));

    await calls.write(id, later);
    await calls.write(id, earlier);

    expect((await calls.of(id)).map((note) => note.durationMs)).toEqual([...earlier, ...later].map((note) => note.durationMs));
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

describe('the notes kept (D9)', () => {
  it('lose a call made 31 days ago', async () => {
    const { id } = await createHostedStore(database).put(contacts, workspaceId, NOW);
    const calls = createMcpCalls(database);
    await calls.write(id, callsFrom(new Date('2026-09-25T09:00:00.000Z'), 1));

    await calls.purgeOld(NOW);

    expect(await calls.of(id)).toEqual([]);
  });
});

/** `count` calls of `list_contacts` a millisecond apart, from `from` on. */
function callsFrom(from: Date, count: number): CallNote[] {
  return Array.from({ length: count }, (_, n) => ({
    action: 'list_contacts',
    version: 1,
    calledAt: new Date(from.getTime() + n),
    result: { kind: 'succeeded' as const },
    durationMs: 120,
  }));
}

describe('the notes of a day (D8)', () => {
  it('go up to 10,000 for an MCP: the call after 9,999 notes is noted', async () => {
    const { id } = await createHostedStore(database).put(contacts, workspaceId, NOW);
    const calls = createMcpCalls(database);
    await calls.write(id, callsFrom(NOW, 9_999));

    await calls.write(id, callsFrom(new Date('2026-10-26T18:00:00.000Z'), 1));

    expect((await calls.of(id)).length).toBe(10_000);
  });

  it('stop at 10,000 for an MCP: a call beyond is not noted', async () => {
    const { id } = await createHostedStore(database).put(contacts, workspaceId, NOW);
    const calls = createMcpCalls(database);
    await calls.write(id, callsFrom(NOW, 10_000));

    await calls.write(id, callsFrom(new Date('2026-10-26T18:00:00.000Z'), 1));

    expect((await calls.of(id)).length).toBe(10_000);
  });

  it('stop at 10,000 for one MCP only: another MCP of the same account is still noted', async () => {
    const store = createHostedStore(database);
    const capped = await store.put(contacts, workspaceId, NOW);
    const other = await store.put(contacts, workspaceId, NOW);
    const calls = createMcpCalls(database);
    await calls.write(capped.id, callsFrom(NOW, 10_000));

    await calls.write(other.id, callsFrom(new Date('2026-10-26T18:00:00.000Z'), 1));

    expect((await calls.of(other.id)).length).toBe(1);
  });

  it('stop at 10,000 within the calls of one request that crosses the limit', async () => {
    const { id } = await createHostedStore(database).put(contacts, workspaceId, NOW);
    const calls = createMcpCalls(database);
    await calls.write(id, callsFrom(NOW, 9_998));

    await calls.write(id, callsFrom(new Date('2026-10-26T18:00:00.000Z'), 3));

    expect((await calls.of(id)).length).toBe(10_000);
  });

  it('stop at 10,000 when the two requests that reach the limit are noted at once', async () => {
    // A real race on PostgreSQL only (`DATABASE_URL`): PGlite's single connection runs the two one after the other.
    // Played twenty times: without a lock, a single run would pass part of the time.
    const store = createHostedStore(database);
    const calls = createMcpCalls(database);
    const counts: number[] = [];
    for (let round = 0; round < 20; round += 1) {
      const { id } = await store.put(contacts, workspaceId, NOW);
      await calls.write(id, callsFrom(NOW, 9_999));

      await Promise.all([
        calls.write(id, callsFrom(new Date('2026-10-26T18:00:00.000Z'), 1)),
        calls.write(id, callsFrom(new Date('2026-10-26T19:00:00.000Z'), 1)),
      ]);
      counts.push((await calls.of(id)).length);
    }

    expect(counts).toEqual(Array.from({ length: 20 }, () => 10_000));
  });

  it('start again the next day, at midnight UTC', async () => {
    const { id } = await createHostedStore(database).put(contacts, workspaceId, NOW);
    const calls = createMcpCalls(database);
    await calls.write(id, callsFrom(NOW, 10_000));

    await calls.write(id, callsFrom(new Date('2026-10-26T23:59:59.999Z'), 1));
    await calls.write(id, callsFrom(new Date('2026-10-27T00:00:00.000Z'), 1));

    expect((await calls.of(id)).slice(10_000).map((note) => note.calledAt.toISOString())).toEqual(['2026-10-27T00:00:00.000Z']);
  });
});
