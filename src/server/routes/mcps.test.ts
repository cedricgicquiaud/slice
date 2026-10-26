// WAT-103/104/105 — `GET /api/mcps` and `DELETE /api/mcps/:id`: an account's own MCPs, never another's.
// WAT-148/149 — `POST /api/mcps/:id/versions/:number/restore`: an existing version of one's own MCP, active again.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app';
import { createAccountMcps } from '../services/account-mcps';
import { createHostedStore, type HostedStore } from '../services/hosted-store';
import type { HostedMcpConfig } from '../services/hosted-mcp-factory';
import { openDatabase, type Database } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { DATABASE_TEST_TIMEOUTS, createTestDatabase, type TestDatabase } from '../db/test-database';
import { createTestAccount, type TestAccount } from '../db/test-account';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

const CREATED = new Date('2026-10-21T10:15:00.000Z');

const NOTION: HostedMcpConfig = {
  name: 'notion',
  apiName: 'Notion API',
  baseUrl: 'https://api.notion.com/v1',
  upstreamAuth: { type: 'bearer' },
  endpoints: [
    { name: 'search', description: 'Search', method: 'POST', path: '/search', params: [] },
    { name: 'get_page', description: 'Get a page', method: 'GET', path: '/pages/{id}', params: [] },
  ],
};

/** The Notes API: three actions in two groups; version 1 holds the reading and the creation of notes. */
const NOTES: HostedMcpConfig = {
  name: 'notes',
  apiName: 'Notes API',
  baseUrl: 'https://notes.example.com/v1',
  upstreamAuth: { type: 'bearer' },
  endpoints: [
    { name: 'list_notes', label: 'List notes', description: 'List notes', method: 'GET', path: '/notes', params: [] },
    { name: 'create_note', label: 'Create a note', description: 'Create a note', method: 'POST', path: '/notes', params: [] },
  ],
  apiActions: [
    { name: 'list_notes', label: 'List notes', group: 'Notes', deprecated: false, method: 'GET', path: '/notes', params: [] },
    { name: 'create_note', label: 'Create a note', group: 'Notes', deprecated: false, method: 'POST', path: '/notes', params: [] },
    { name: 'empty_trash', label: 'Empty the trash', group: 'Trash', deprecated: false, method: 'DELETE', path: '/trash', params: [] },
  ],
};

let testDb: TestDatabase;
let database: Database;
let store: HostedStore;
let account: TestAccount;
let app: Server;
let baseUrl: string;

beforeAll(async () => {
  testDb = await createTestDatabase();
  database = openDatabase(testDb.config);
  await migrateDatabase(database);
  store = createHostedStore(database);
  account = await createTestAccount({ database });

  app = createApp({
    nodeEnv: 'test',
    hostedStore: store,
    accountMcps: createAccountMcps(database),
    auth: account.auth,
  }).listen(0);
  await new Promise<void>((r) => app.once('listening', r));
  baseUrl = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});

/**
 * Another server on the same database, for a block of tests: each keeps its own
 * count of requests, so the files' tests stay under the rate limit of `/api/*`.
 */
async function startApp(): Promise<{ url: string; close(): Promise<void> }> {
  const server = createApp({
    nodeEnv: 'test',
    hostedStore: store,
    accountMcps: createAccountMcps(database),
    auth: account.auth,
  }).listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

afterAll(async () => {
  await new Promise<void>((r) => (app ? app.close(() => r()) : r()));
  await database?.close();
  await testDb?.dispose();
});

describe('GET /api/mcps', () => {
  it("lists the signed-in account's MCPs with their address", async () => {
    const { id } = await store.put(NOTION, account.workspaceId, CREATED);

    const res = await fetch(`${baseUrl}/api/mcps`, { headers: { cookie: account.cookie } });

    expect({ status: res.status, body: await res.json() }).toEqual({
      status: 200,
      body: {
        mcps: [
          {
            id,
            apiName: 'Notion API',
            actionCount: 2,
            createdAt: '2026-10-21T10:15:00.000Z',
            url: `${baseUrl}/m/${id}`,
          },
        ],
      },
    });
  });
});

describe('GET /api/mcps/:id/versions', () => {
  it("answers another account's MCP exactly as an unknown id, and changes nothing (contract 19, D12)", async () => {
    const other = await createTestAccount({ database, email: 'curious-neighbour@example.com' });
    const { id } = await store.put(NOTION, other.workspaceId, CREATED);

    const theirs = await fetch(`${baseUrl}/api/mcps/${id}/versions`, { headers: { cookie: account.cookie } });
    const unknown = await fetch(`${baseUrl}/api/mcps/no-such-mcp-id/versions`, { headers: { cookie: account.cookie } });

    expect({
      theirs: { status: theirs.status, body: await theirs.text() },
      unknown: { status: unknown.status, body: await unknown.text() },
      stillServed: (await store.get(id))?.endpoints.length,
    }).toEqual({
      theirs: { status: 404, body: '{"code":"NOT_FOUND","message":"Unknown MCP id."}' },
      unknown: { status: 404, body: '{"code":"NOT_FOUND","message":"Unknown MCP id."}' },
      stillServed: 2,
    });
  });
});

describe('DELETE /api/mcps/:id', () => {
  it('deletes my MCP at once: its address then answers 404 Unknown MCP id (contract 26)', async () => {
    const { id } = await store.put(NOTION, account.workspaceId, CREATED);

    const deleted = await fetch(`${baseUrl}/api/mcps/${id}`, { method: 'DELETE', headers: { cookie: account.cookie } });
    const runtime = await fetch(`${baseUrl}/m/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    expect({ deleted: deleted.status, runtime: runtime.status, body: await runtime.text() }).toEqual({
      deleted: 204,
      runtime: 404,
      body: '{"error":"Unknown MCP id."}',
    });
  });

  it("refuses to delete another account's MCP as if it did not exist, and keeps it (contract 17)", async () => {
    const other = await createTestAccount({ database, email: 'other@example.com' });
    const { id } = await store.put(NOTION, other.workspaceId, CREATED);

    const res = await fetch(`${baseUrl}/api/mcps/${id}`, { method: 'DELETE', headers: { cookie: account.cookie } });

    expect({ status: res.status, body: await res.text(), kept: (await store.get(id)) !== undefined }).toEqual({
      status: 404,
      body: '{"code":"NOT_FOUND","message":"Unknown MCP id."}',
      kept: true,
    });
  });
});

describe('/api/mcps refusals inherited from the guards', () => {
  it.each(['GET', 'DELETE'])('answers 401 to %s without a session (contract 15)', async (method) => {
    const { id } = await store.put(NOTION, account.workspaceId, CREATED);

    const res = await fetch(`${baseUrl}/api/mcps${method === 'DELETE' ? `/${id}` : ''}`, { method });

    expect({ status: res.status, kept: (await store.get(id)) !== undefined }).toEqual({ status: 401, kept: true });
  });

  it("answers 401 to an MCP's history without a session (contract 20)", async () => {
    const { id } = await store.put(NOTION, account.workspaceId, CREATED);

    const res = await fetch(`${baseUrl}/api/mcps/${id}/versions`);

    expect(res.status).toBe(401);
  });

  it('answers 403 to a deletion sent from another site, session or not (D16)', async () => {
    const { id } = await store.put(NOTION, account.workspaceId, CREATED);

    const res = await fetch(`${baseUrl}/api/mcps/${id}`, {
      method: 'DELETE',
      headers: { cookie: account.cookie, origin: 'https://evil.example' },
    });

    expect({ status: res.status, kept: (await store.get(id)) !== undefined }).toEqual({ status: 403, kept: true });
  });
});

describe('GET /api/mcps/:id/selection', () => {
  let edit: { url: string; close(): Promise<void> };
  beforeAll(async () => {
    edit = await startApp();
  });
  afterAll(async () => {
    await edit?.close();
  });

  it("answers every action of my MCP's API by group, and those of its active version (contract 3, D2)", async () => {
    const { id } = await store.put(NOTES, account.workspaceId, CREATED);

    const res = await fetch(`${edit.url}/api/mcps/${id}/selection`, { headers: { cookie: account.cookie } });

    expect({ status: res.status, body: await res.json() }).toEqual({
      status: 200,
      body: {
        apiName: 'Notes API',
        version: 1,
        groups: [
          {
            tag: 'Notes',
            endpoints: [
              { id: 'GET /notes', method: 'GET', path: '/notes', label: 'List notes', deprecated: false, params: [] },
              { id: 'POST /notes', method: 'POST', path: '/notes', label: 'Create a note', deprecated: false, params: [] },
            ],
          },
          {
            tag: 'Trash',
            endpoints: [
              { id: 'DELETE /trash', method: 'DELETE', path: '/trash', label: 'Empty the trash', deprecated: false, params: [] },
            ],
          },
        ],
        selectedIds: ['GET /notes', 'POST /notes'],
      },
    });
  });

  it("answers another account's MCP exactly as an unknown id (contract 19, D12)", async () => {
    const other = await createTestAccount({ database, email: 'neighbour-selection@example.com' });
    const { id } = await store.put(NOTES, other.workspaceId, CREATED);

    const theirs = await fetch(`${edit.url}/api/mcps/${id}/selection`, { headers: { cookie: account.cookie } });
    const unknown = await fetch(`${edit.url}/api/mcps/no-such-mcp-id/selection`, { headers: { cookie: account.cookie } });

    expect({
      theirs: { status: theirs.status, body: await theirs.text() },
      unknown: { status: unknown.status, body: await unknown.text() },
    }).toEqual({
      theirs: { status: 404, body: '{"code":"NOT_FOUND","message":"Unknown MCP id."}' },
      unknown: { status: 404, body: '{"code":"NOT_FOUND","message":"Unknown MCP id."}' },
    });
  });
});

describe('POST /api/mcps/:id/versions', () => {
  let edit: { url: string; close(): Promise<void> };
  beforeAll(async () => {
    edit = await startApp();
  });
  afterAll(async () => {
    await edit?.close();
  });

  /** "Save" on "Edit actions", as the signed-in account; without a session when `cookie` is `null`. */
  function save(id: string, change: unknown, cookie: string | null = account.cookie) {
    return fetch(`${edit.url}/api/mcps/${id}/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
      body: JSON.stringify(change),
    });
  }

  it('makes the new selection version 2 at the same address: the agent lists its actions, My MCPs counts them (contract 5, 6)', async () => {
    const { id } = await store.put(NOTES, account.workspaceId, CREATED);

    const saved = await save(id, { fromVersion: 1, selectedIds: ['GET /notes', 'POST /notes', 'DELETE /trash'] });
    const listed = (await (await fetch(`${edit.url}/api/mcps`, { headers: { cookie: account.cookie } })).json()) as {
      mcps: Array<{ id: string; actionCount: number; url: string }>;
    };
    const agent = new Client({ name: 'agent', version: '0.0.0' });
    await agent.connect(new StreamableHTTPClientTransport(new URL(`${edit.url}/m/${id}`)));
    const { tools } = await agent.listTools();
    await agent.close();

    expect({
      saved: { status: saved.status, body: await saved.json() },
      listed: listed.mcps.find((mcp) => mcp.id === id),
      tools: tools.map((tool) => tool.name),
    }).toEqual({
      saved: { status: 201, body: { number: 2 } },
      listed: { id, apiName: 'Notes API', actionCount: 3, createdAt: CREATED.toISOString(), url: `${edit.url}/m/${id}` },
      tools: ['list_notes', 'create_note', 'empty_trash'],
    });
  });

  it.each([
    ['a name', { mcpName: 'notes-v2' }],
    ["an API's address", { baseUrl: 'https://evil.example.com' }],
    ['an upstream access', { upstreamAuth: { type: 'none' } }],
  ])('refuses a change holding %s, and saves nothing, not even the selection (contract 17, D3)', async (_what, extra) => {
    const { id } = await store.put(NOTES, account.workspaceId, CREATED);

    const res = await save(id, { fromVersion: 1, selectedIds: ['GET /notes'], ...extra });

    expect({ status: res.status, body: await res.json(), served: (await store.get(id))?.endpoints.length }).toEqual({
      status: 400,
      body: { code: 'INVALID_SELECTION', message: 'Only the selection of actions can be changed.' },
      served: 2,
    });
  });

  it("refuses an action that is not one of the API's, and saves nothing (contract 16)", async () => {
    const { id } = await store.put(NOTES, account.workspaceId, CREATED);

    const res = await save(id, { fromVersion: 1, selectedIds: ['GET /notes', 'GET /admin/users'] });

    expect({ status: res.status, body: await res.json(), served: (await store.get(id))?.endpoints.length }).toEqual({
      status: 400,
      body: { code: 'INVALID_SELECTION', message: "This MCP's API has no such action." },
      served: 2,
    });
  });

  it('refuses a change started from a version no longer active, two tabs open, and saves nothing (contract 23, D13)', async () => {
    const { id } = await store.put(NOTES, account.workspaceId, CREATED);
    await save(id, { fromVersion: 1, selectedIds: ['GET /notes'] });

    const res = await save(id, { fromVersion: 1, selectedIds: ['GET /notes', 'DELETE /trash'] });

    expect({
      status: res.status,
      body: await res.json(),
      served: (await store.get(id))?.endpoints.map((action) => action.name),
    }).toEqual({
      status: 409,
      body: { code: 'CONFLICT', message: 'This MCP changed in the meantime. Reload to see its current actions.' },
      served: ['list_notes'],
    });
  });

  it("creates no version for the active version's selection (contract 14, D5)", async () => {
    const { id } = await store.put(NOTES, account.workspaceId, CREATED);

    const res = await save(id, { fromVersion: 1, selectedIds: ['POST /notes', 'GET /notes'] });

    expect({ status: res.status, body: await res.json() }).toEqual({
      status: 400,
      body: { code: 'INVALID_SELECTION', message: 'This selection is already the active version.' },
    });
  });

  it('refuses a change without any action (contract 15)', async () => {
    const { id } = await store.put(NOTES, account.workspaceId, CREATED);

    const res = await save(id, { fromVersion: 1, selectedIds: [] });

    expect({ status: res.status, body: await res.json(), served: (await store.get(id))?.endpoints.length }).toEqual({
      status: 400,
      body: { code: 'INVALID_SELECTION', message: 'Pick at least one action.' },
      served: 2,
    });
  });

  it("answers a change of another account's MCP exactly as an unknown id, and changes nothing (contract 19, D12)", async () => {
    const other = await createTestAccount({ database, email: 'neighbour-save@example.com' });
    const { id } = await store.put(NOTES, other.workspaceId, CREATED);
    const change = { fromVersion: 1, selectedIds: ['GET /notes'] };

    const theirs = await save(id, change);
    const unknown = await save('no-such-mcp-id', change);

    expect({
      theirs: { status: theirs.status, body: await theirs.text() },
      unknown: { status: unknown.status, body: await unknown.text() },
      served: (await store.get(id))?.endpoints.length,
    }).toEqual({
      theirs: { status: 404, body: '{"code":"NOT_FOUND","message":"Unknown MCP id."}' },
      unknown: { status: 404, body: '{"code":"NOT_FOUND","message":"Unknown MCP id."}' },
      served: 2,
    });
  });

  it('answers 401 to a change without a session, and changes nothing (contract 20)', async () => {
    const { id } = await store.put(NOTES, account.workspaceId, CREATED);

    const res = await save(id, { fromVersion: 1, selectedIds: ['GET /notes'] }, null);

    expect({ status: res.status, served: (await store.get(id))?.endpoints.length }).toEqual({ status: 401, served: 2 });
  });
});

describe('POST /api/mcps/:id/versions/:number/restore', () => {
  let edit: { url: string; close(): Promise<void> };
  beforeAll(async () => {
    edit = await startApp();
  });
  afterAll(async () => {
    await edit?.close();
  });

  /** "Restore" on "History", as the signed-in account; without a session when `cookie` is `null`. */
  function restore(id: string, number: number | string, cookie: string | null = account.cookie) {
    return fetch(`${edit.url}/api/mcps/${id}/versions/${number}/restore`, {
      method: 'POST',
      headers: cookie ? { cookie } : {},
    });
  }

  /** My MCP of the Notes API, its version 2 (the reading of notes only) active. */
  async function notesAtVersion2(): Promise<string> {
    const { id } = await store.put(NOTES, account.workspaceId, CREATED);
    await createAccountMcps(database).saveSelection(account.workspaceId, id, { fromVersion: 1, selectedIds: ['GET /notes'] });
    return id;
  }

  it('makes version 1 active again at the same address: the agent lists its actions, My MCPs counts them, no version is made (contract 10, D11)', async () => {
    const id = await notesAtVersion2();
    const asked = Date.now();

    const restored = await restore(id, 1);
    const answered = Date.now();
    const { number, activeSince } = (await restored.json()) as { number: number; activeSince: string };
    const listed = (await (await fetch(`${edit.url}/api/mcps`, { headers: { cookie: account.cookie } })).json()) as {
      mcps: Array<{ id: string; actionCount: number }>;
    };
    const history = (await (await fetch(`${edit.url}/api/mcps/${id}/versions`, { headers: { cookie: account.cookie } })).json()) as {
      versions: Array<{ number: number }>;
    };
    const agent = new Client({ name: 'agent', version: '0.0.0' });
    await agent.connect(new StreamableHTTPClientTransport(new URL(`${edit.url}/m/${id}`)));
    const { tools } = await agent.listTools();
    await agent.close();

    expect({
      restored: { status: restored.status, number, activeSinceNow: asked <= Date.parse(activeSince) && Date.parse(activeSince) <= answered },
      actionCount: listed.mcps.find((mcp) => mcp.id === id)?.actionCount,
      versions: history.versions.map((version) => version.number),
      tools: tools.map((tool) => tool.name),
    }).toEqual({
      restored: { status: 200, number: 1, activeSinceNow: true },
      actionCount: 2,
      versions: [2, 1],
      tools: ['list_notes', 'create_note'],
    });
  });

  it("numbers the change saved after restoring version 1 as version 3, started from version 1's actions (contract 11, D9)", async () => {
    const id = await notesAtVersion2();
    await restore(id, 1);

    const { version, selectedIds } = (await (
      await fetch(`${edit.url}/api/mcps/${id}/selection`, { headers: { cookie: account.cookie } })
    ).json()) as { version: number; selectedIds: string[] };
    const saved = await fetch(`${edit.url}/api/mcps/${id}/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: account.cookie },
      body: JSON.stringify({ fromVersion: version, selectedIds: [...selectedIds, 'DELETE /trash'] }),
    });

    expect({
      read: { version, selectedIds },
      saved: { status: saved.status, body: await saved.json() },
      served: (await store.get(id))?.endpoints.map((action) => action.name),
    }).toEqual({
      read: { version: 1, selectedIds: ['GET /notes', 'POST /notes'] },
      saved: { status: 201, body: { number: 3 } },
      served: ['list_notes', 'create_note', 'empty_trash'],
    });
  });

  it.each([
    ['a number it does not have', '7'],
    ['a number past any version', '99999999999'],
    ['no number at all', 'latest'],
  ])('answers 404 to a version of my MCP given as %s, and changes nothing (contract 21)', async (_what, number) => {
    const id = await notesAtVersion2();

    const res = await restore(id, number);

    expect({ status: res.status, body: await res.json(), served: (await store.get(id))?.endpoints.map((action) => action.name) }).toEqual({
      status: 404,
      body: { code: 'NOT_FOUND', message: 'Unknown version of this MCP.' },
      served: ['list_notes'],
    });
  });
});
