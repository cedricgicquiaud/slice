// E2E for the hosted runtime routes (Pivot-4): POST /api/host stores a config
// and returns a URL; /m/:id serves the MCP, multi-session (several agents in
// parallel), relaying each caller's own token to the upstream.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';
import { createApp } from '../app';
import { createHostedStore, type HostedStore } from '../services/hosted-store';
import { createAccountMcps } from '../services/account-mcps';
import { createMcpCalls, type McpCalls } from '../services/mcp-calls';
import type { HostedMcpConfig } from '../services/hosted-mcp-factory';
import { openDatabase, type Database } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { DATABASE_TEST_TIMEOUTS, createTestDatabase, type TestDatabase } from '../db/test-database';
import { createTestAccount, type TestAccount } from '../db/test-account';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

const SPEC = `openapi: 3.0.3
info: { title: Demo, version: "1.0" }
servers: [{ url: http://placeholder }]
paths:
  /things:
    get:
      operationId: listThings
      summary: List things
      responses: { '200': { description: ok } }
`;

let upstream: Server;
let upstreamUrl: string;
let received: Array<{ url: string; auth: string | undefined; apiKey: string | undefined }> = [];
/** What the API does before it answers; tests make it slow. */
let beforeAnswer: () => Promise<void> = async () => {};
let testDb: TestDatabase;
let database: Database;
let store: HostedStore;
let calls: McpCalls;
let account: TestAccount;
let app: Server;
let baseUrl: string;

const CREATED = new Date('2026-10-24T09:00:00.000Z');
/** The servers' clock: every app of this file reads it, tests move it. */
let clock = CREATED;
const now = () => clock;
const hoursAfterCreation = (hours: number) => new Date(CREATED.getTime() + hours * 3_600_000);

beforeEach(() => {
  clock = CREATED;
  beforeAnswer = async () => {};
});

beforeAll(async () => {
  upstream = createServer(async (req, res) => {
    received.push({ url: req.url ?? '', auth: req.headers.authorization, apiKey: req.headers['x-api-key'] as string | undefined });
    await beforeAnswer();
    if (req.url === '/things/garbled') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok": tru');
      return;
    }
    if (req.url === '/things/echo') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ body: 'API-RESPONSE-BODY' }));
      return;
    }
    // `/things/404`, `/things/500`: the API answers that status code.
    const failure = /^\/things\/([45]\d\d)$/.exec(req.url ?? '');
    if (failure) {
      res.writeHead(Number(failure[1]), { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'API-ERROR-MESSAGE' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((r) => upstream.listen(0, r));
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

  testDb = await createTestDatabase();
  database = openDatabase(testDb.config);
  await migrateDatabase(database);
  store = createHostedStore(database);
  calls = createMcpCalls(database);
  account = await createTestAccount({ database });

  app = createApp({
    nodeEnv: 'test',
    hostedStore: store,
    mcpCalls: calls,
    accountMcps: createAccountMcps(database),
    now,
    auth: account.auth,
  }).listen(0);
  await new Promise<void>((r) => app.once('listening', r));
  baseUrl = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => (app ? app.close(() => r()) : r()));
  await new Promise<void>((r) => (upstream ? upstream.close(() => r()) : r()));
  await database?.close();
  await testDb?.dispose();
});

async function connectAgent(url: string, token: string): Promise<Client> {
  const client = new Client({ name: 'agent', version: '0.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    })
  );
  return client;
}

/** A connector with three actions in a deliberate order: a read then two writes. */
function threeActions(): HostedMcpConfig {
  return {
    name: 'things',
    baseUrl: upstreamUrl,
    upstreamAuth: { type: 'bearer' },
    endpoints: [
      {
        name: 'list_things',
        description: 'List things',
        method: 'GET',
        path: '/things',
        params: [{ name: 'limit', in: 'query', type: 'integer', required: false }],
      },
      {
        name: 'create_thing',
        description: 'Create a thing',
        method: 'POST',
        path: '/things',
        params: [{ name: 'title', in: 'body', type: 'string', required: true, wireName: 'title' }],
      },
      {
        name: 'delete_thing',
        description: 'Delete a thing',
        method: 'DELETE',
        path: '/things/{id}',
        params: [{ name: 'id', in: 'path', type: 'string', required: true }],
      },
    ],
  };
}

/** Version 2, holding only the deletion, made active an hour after the creation. */
async function activateDeletionOnly(id: string): Promise<void> {
  await database.rows(sql`update connector_versions set active_since = null where connector_id = ${id}`);
  await database.rows(
    sql`insert into connector_versions (connector_id, number, created_at, active_since)
        values (${id}, 2, ${hoursAfterCreation(1)}, ${hoursAfterCreation(1)})`
  );
  await database.rows(
    sql`insert into connector_actions (connector_id, version, position, name, label, description, method, path, params)
        values (${id}, 2, 0, 'delete_thing', 'Delete a thing', 'Delete a thing', 'DELETE', '/things/{id}',
                ${JSON.stringify([{ name: 'id', in: 'path', type: 'string', required: true }])}::jsonb)`
  );
}

describe('hosted connector served from the database', () => {
  it('serves its actions in order, with their parameters and read/write labels', async () => {
    const { id } = await store.put(threeActions(), account.workspaceId, new Date());

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'TOKEN');
    const { tools } = await agent.listTools();
    await agent.close();

    expect(
      tools.map((t) => [t.name, Object.keys(t.inputSchema.properties ?? {}), t.annotations?.readOnlyHint])
    ).toEqual([
      ['list_things', ['limit'], true],
      ['create_thing', ['title'], false],
      ['delete_thing', ['id'], false],
    ]);
  });

  it('serves the actions of its active version only (D4)', async () => {
    const { id } = await store.put(threeActions(), account.workspaceId, CREATED);
    await activateDeletionOnly(id);

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'TOKEN');
    const { tools } = await agent.listTools();
    await agent.close();

    expect(tools.map((t) => t.name)).toEqual(['delete_thing']);
  });

  it('asks an agent calling an action the active version lacks to start a new conversation, without calling the API (contract 18, D7)', async () => {
    const { id } = await store.put(threeActions(), account.workspaceId, CREATED);
    await activateDeletionOnly(id);
    received = [];

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'TOKEN');
    const retired = await agent.callTool({ name: 'create_thing', arguments: { title: 'Groceries' } });
    const neverExisted = await agent.callTool({ name: 'drop_everything', arguments: {} });
    const kept = await agent.callTool({ name: 'delete_thing', arguments: { id: '42' } });
    await agent.close();

    const gone = {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'This action is no longer available in this MCP. Start a new conversation to get the current list of actions.',
        },
      ],
    };
    expect({ retired, neverExisted, kept: kept.isError ?? false, upstreamCalls: received.map((call) => call.url) }).toEqual({
      retired: gone,
      neverExisted: gone,
      kept: false,
      upstreamCalls: ['/things/42'],
    });
  });

  it('gives a connector created from screen 4 a 22-character address kept in the database', async () => {
    const url = await host();
    const id = url.split('/m/')[1]!;

    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((await store.get(id))?.endpoints.map((e) => e.name)).toEqual(['list_things']);
  });

  it("puts a connector created from screen 4 in the signed-in account's workspace, under the API's name (D15, D9)", async () => {
    const id = (await host()).split('/m/')[1]!;

    expect(await store.get(id)).toMatchObject({ workspaceId: account.workspaceId, apiName: 'Demo' });
  });

  it("relays the agent's API key in the header the API expects", async () => {
    received = [];
    const { id } = await store.put(
      { ...threeActions(), upstreamAuth: { type: 'apiKey', headerName: 'X-Api-Key' } },
      account.workspaceId,
      new Date()
    );

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'KEY-123');
    await agent.callTool({ name: 'list_things', arguments: {} });
    await agent.close();

    expect(received.map((r) => r.apiKey)).toEqual(['KEY-123']);
  });

  it('keeps no upstream key, no token and not the API description in the database, versions and lists included (contract 24)', async () => {
    const res = await fetch(`${baseUrl}/api/host`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: account.cookie },
      body: JSON.stringify({
        parsedSpec: {},
        rawSpec: SPEC,
        selectedIds: ['GET /things'],
        config: {
          mcpName: 'demo',
          baseUrl: upstreamUrl,
          upstreamAuth: { type: 'apiKey', headerName: 'X-Api-Key' },
          hosting: 'cloud',
          mode: 'remote',
          mcpServerToken: 'feedfacefeedfacefeedfacefeedface',
          includeParamDescriptions: false,
          retryOnServerError: false,
        },
      }),
    });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    const agent = await connectAgent(url, 'AGENT-SECRET-0002');
    await agent.callTool({ name: 'list_things', arguments: {} });
    await agent.close();

    const everything = await database.rows<{ kind: string; row: string }>(
      sql`select 'connector' as kind, row_to_json(c)::text as row from connectors c
          union all select 'version', row_to_json(v)::text from connector_versions v
          union all select 'action', row_to_json(a)::text from connector_actions a
          union all select 'api action', row_to_json(l)::text from connector_api_actions l`
    );
    expect(new Set(everything.map((r) => r.kind))).toEqual(new Set(['connector', 'version', 'action', 'api action']));
    expect(everything.filter((r) => /feedface|AGENT-SECRET|openapi: 3\.0\.3|info: \{ title/.test(r.row))).toEqual([]);
  });
});

/** `config`, whose API's actions are exactly its own: every call of them is noted (D2). */
function withApiActions(config: HostedMcpConfig): HostedMcpConfig {
  return {
    ...config,
    apiActions: config.endpoints.map(({ name, description, method, path, params }) => ({
      name,
      label: description,
      group: 'Things',
      deprecated: false,
      method,
      path,
      params,
    })),
  };
}

// WAT-155 — a call that reaches the API is noted with what the API answered.
describe('the note of an action call that reaches the API', () => {
  it('is "Succeeded" when the API answers with a 2xx, on the active version, dated from its arrival (contract 2, D3, D6)', async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'TOKEN');
    await agent.callTool({ name: 'list_things', arguments: {} });
    await agent.close();

    await vi.waitFor(async () =>
      expect(await calls.of(id)).toEqual([
        { action: 'list_things', version: 1, calledAt: CREATED, result: { kind: 'succeeded' }, durationMs: expect.any(Number) },
      ])
    );
  });

  it('is dated from the arrival of the call, and lasts until SLICE is done with it, in milliseconds (D6)', async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);
    beforeAnswer = async () => {
      clock = hoursAfterCreation(1);
      await new Promise((r) => setTimeout(r, 300));
    };

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'TOKEN');
    await agent.callTool({ name: 'list_things', arguments: {} });
    await agent.close();

    await vi.waitFor(async () => {
      const [note] = await calls.of(id);
      expect({ calledAt: note?.calledAt, lastsTheApiWait: (note?.durationMs ?? 0) >= 300 }).toEqual({
        calledAt: CREATED,
        lastsTheApiWait: true,
      });
    });
  });

  it('keeps the number of the version active when the call arrived (D3)', async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);
    await activateDeletionOnly(id);

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'TOKEN');
    await agent.callTool({ name: 'delete_thing', arguments: { id: '42' } });
    await agent.close();

    await vi.waitFor(async () => expect((await calls.of(id)).map((note) => note.version)).toEqual([2]));
  });

  it('changes nothing of what the agent reads: the result, or the API\'s code and message (relay unchanged)', async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'TOKEN');
    const answered = await agent.callTool({ name: 'list_things', arguments: {} });
    const failed = await agent.callTool({ name: 'delete_thing', arguments: { id: '404' } });
    await agent.close();

    expect({ answered, failed }).toEqual({
      answered: { content: [{ type: 'text', text: '{\n  "ok": true\n}' }] },
      failed: {
        isError: true,
        content: [{ type: 'text', text: 'Upstream 404 Not Found: {"error":"API-ERROR-MESSAGE"}' }],
      },
    });
  });

  it('is "Failed" with the code kept when the API answers another code: 404, 500 (contract 3, D4)', async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'TOKEN');
    await agent.callTool({ name: 'delete_thing', arguments: { id: '404' } });
    await agent.callTool({ name: 'delete_thing', arguments: { id: '500' } });
    await agent.close();

    await vi.waitFor(async () =>
      expect((await calls.of(id)).map((note) => note.result)).toEqual([
        { kind: 'failed', status: 404 },
        { kind: 'failed', status: 500 },
      ])
    );
  });

  it('is "API unreachable" when nothing answers at the API\'s address, and the agent reads an error (contract 4, D4)', async () => {
    const { id } = await store.put(
      withApiActions({ ...threeActions(), baseUrl: await closedAddress() }),
      account.workspaceId,
      CREATED
    );

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'TOKEN');
    const answer = await agent.callTool({ name: 'list_things', arguments: {} });
    await agent.close();

    await vi.waitFor(async () =>
      expect({ agentError: answer.isError, results: (await calls.of(id)).map((note) => note.result) }).toEqual({
        agentError: true,
        results: [{ kind: 'api_unreachable' }],
      })
    );
  });

  it('is "API unreachable" when the SSRF guard refuses the API\'s address at the time of the call (contract 4, D4)', async () => {
    // A production-like instance: allowPrivateHosts off → the loopback API is refused at each call.
    const guarded = createApp({ nodeEnv: 'test', allowPrivateHosts: false, hostedStore: store, mcpCalls: calls, now, auth: account.auth }).listen(0);
    await new Promise<void>((r) => guarded.once('listening', r));
    try {
      const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);
      received = [];

      const agent = await connectAgent(`http://127.0.0.1:${(guarded.address() as AddressInfo).port}/m/${id}`, 'TOKEN');
      await agent.callTool({ name: 'list_things', arguments: {} });
      await agent.close();

      await vi.waitFor(async () =>
        expect({ upstreamCalls: received.length, results: (await calls.of(id)).map((note) => note.result) }).toEqual({
          upstreamCalls: 0,
          results: [{ kind: 'api_unreachable' }],
        })
      );
    } finally {
      await new Promise<void>((r) => guarded.close(() => r()));
    }
  });

  it('is "SLICE error", never "API unreachable", when SLICE itself fails during the call (contract 7, D4)', async () => {
    // SLICE builds the API's address from what it stored: here, no address at all.
    const { id } = await store.put(withApiActions({ ...threeActions(), baseUrl: 'not-an-address' }), account.workspaceId, CREATED);

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'TOKEN');
    await agent.callTool({ name: 'list_things', arguments: {} });
    await agent.close();

    await vi.waitFor(async () =>
      expect((await calls.of(id)).map((note) => note.result)).toEqual([{ kind: 'slice_error' }])
    );
  });

  it('is "SLICE error" when the API answers a 2xx whose JSON body cannot be read, and the agent reads an error (D4)', async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'TOKEN');
    const answer = await agent.callTool({ name: 'delete_thing', arguments: { id: 'garbled' } });
    await agent.close();

    await vi.waitFor(async () =>
      expect({ agentError: answer.isError, results: (await calls.of(id)).map((note) => note.result) }).toEqual({
        agentError: true,
        results: [{ kind: 'slice_error' }],
      })
    );
  });

  it('is "SLICE error" when SLICE fails before its engine runs, the agent reading a server error (contract 7, D4)', async () => {
    // Two actions under one name: SLICE cannot build the MCP it stored.
    const listTwice = { ...threeActions(), endpoints: [threeActions().endpoints[0]!, threeActions().endpoints[0]!] };
    const { id } = await store.put(withApiActions(listTwice), account.workspaceId, CREATED);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await fetch(`${baseUrl}/m/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify(toolCall(1, 'list_things', {})),
      });

      expect(res.status).toBe(500);
      await vi.waitFor(async () =>
        expect((await calls.of(id)).map((note) => note.result)).toEqual([{ kind: 'slice_error' }])
      );
    } finally {
      logged.mockRestore();
    }
  });

  it('is "SLICE error" when SLICE fails after the answer has begun, the request ending without an error code (contract 7, D4)', async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);
    received = [];
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    // The answer has started, then SLICE breaks before its engine ever sees the call.
    const handling = vi
      .spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest')
      .mockImplementationOnce(async (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' }).end();
        throw new Error('SLICE broke after the headers');
      });
    try {
      const res = await fetch(`${baseUrl}/m/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify(toolCall(1, 'list_things', {})),
      });

      expect(res.status).toBe(200);
      await vi.waitFor(async () =>
        expect({ upstreamCalls: received.length, results: (await calls.of(id)).map((note) => note.result) }).toEqual({
          upstreamCalls: 0,
          results: [{ kind: 'slice_error' }],
        })
      );
    } finally {
      handling.mockRestore();
      logged.mockRestore();
    }
  });
});

// WAT-156 — a call refused before the API is noted all the same.
describe('the note of an action call refused before the API', () => {
  it('is "Invalid request" when the agent sends values the action refuses, and the API is not called (contract 5, D4)', async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);
    received = [];

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'TOKEN');
    const answer = await agent.callTool({ name: 'list_things', arguments: { limit: 'many' } });
    await agent.close();

    await vi.waitFor(async () =>
      expect({
        agentError: answer.isError,
        upstreamCalls: received.length,
        results: (await calls.of(id)).map((note) => note.result),
      }).toEqual({ agentError: true, upstreamCalls: 0, results: [{ kind: 'invalid_request' }] })
    );
  });

  it('is "Invalid request" when the MCP protocol refuses the request itself, and the API is not called (D4)', async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);
    received = [];

    // Without `text/event-stream` in Accept, the MCP transport refuses the request before any action runs.
    const res = await fetch(`${baseUrl}/m/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(toolCall(1, 'list_things', {})),
    });

    expect(res.status).toBe(406);
    await vi.waitFor(async () =>
      expect({ upstreamCalls: received.length, results: (await calls.of(id)).map((note) => note.result) }).toEqual({
        upstreamCalls: 0,
        results: [{ kind: 'invalid_request' }],
      })
    );
  });

  it('is "Not available" for an action of the API the active version lacks: retired, or never chosen (contract 6, D4)', async () => {
    const neverChosen = { name: 'archive_thing', description: 'Archive a thing', method: 'POST' as const, path: '/things/archive', params: [] };
    const config = withApiActions({ ...threeActions(), endpoints: [...threeActions().endpoints, neverChosen] });
    const { id } = await store.put({ ...config, endpoints: threeActions().endpoints }, account.workspaceId, CREATED);
    await activateDeletionOnly(id);

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'TOKEN');
    await agent.callTool({ name: 'create_thing', arguments: { title: 'Groceries' } });
    await agent.callTool({ name: 'archive_thing', arguments: {} });
    await agent.close();

    await vi.waitFor(async () =>
      expect((await calls.of(id)).map(({ action, version, result }) => ({ action, version, result }))).toEqual([
        { action: 'create_thing', version: 2, result: { kind: 'not_available' } },
        { action: 'archive_thing', version: 2, result: { kind: 'not_available' } },
      ])
    );
  });
});

/** Send several JSON-RPC messages in one request (a batch), as the SDK accepts them; the raw answer. */
async function postBatch(url: string, messages: unknown[]): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: 'Bearer TOKEN',
    },
    body: JSON.stringify(messages),
  });
  return res.text();
}

const toolCall = (id: number, name: string, args: Record<string, unknown>) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name, arguments: args },
});

// WAT-156 — a request carrying several action calls.
describe('a batch of action calls', () => {
  it('notes each of its calls (contract 13)', async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);

    await postBatch(`${baseUrl}/m/${id}`, [toolCall(1, 'list_things', {}), toolCall(2, 'delete_thing', { id: '42' })]);

    await vi.waitFor(async () =>
      expect((await calls.of(id)).map(({ action, result }) => `${action} ${result.kind}`).sort()).toEqual([
        'delete_thing succeeded',
        'list_things succeeded',
      ])
    );
  });

  it('serves the active version\'s action, asks to start over for the retired one without calling the API, and notes both (contract 13, P-WAT-41 contract 18)', async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);
    await activateDeletionOnly(id);
    received = [];

    const answer = await postBatch(`${baseUrl}/m/${id}`, [
      toolCall(1, 'delete_thing', { id: '42' }),
      toolCall(2, 'create_thing', { title: 'Groceries' }),
    ]);

    const retired = sseMessages(answer).find((message) => message.id === 2);
    await vi.waitFor(async () =>
      expect({
        retired: retired?.result,
        upstreamCalls: received.map((call) => call.url),
        notes: (await calls.of(id)).map(({ action, result }) => `${action} ${result.kind}`).sort(),
      }).toEqual({
        retired: { isError: true, content: [{ type: 'text', text: ACTION_GONE_TEXT }] },
        upstreamCalls: ['/things/42'],
        notes: ['create_thing not_available', 'delete_thing succeeded'],
      })
    );
  });

  it('notes each of its calls with its own result, even when two calls share one id (contract 13)', async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);

    await postBatch(`${baseUrl}/m/${id}`, [toolCall(7, 'list_things', {}), toolCall(7, 'delete_thing', { id: '404' })]);

    await vi.waitFor(async () =>
      expect((await calls.of(id)).map(({ action, result }) => `${action} ${JSON.stringify(result)}`).sort()).toEqual([
        'delete_thing {"kind":"failed","status":404}',
        'list_things {"kind":"succeeded"}',
      ])
    );
  });
});

// WAT-158 — what is never noted.
describe('what is never noted', () => {
  it('is a call whose name is not an action of the MCP\'s API (contract 16, D2)', async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);

    // In one request, so that both notes are written at once: the real call's note proves the write happened.
    await postBatch(`${baseUrl}/m/${id}`, [toolCall(1, 'drop_everything', {}), toolCall(2, 'list_things', {})]);

    await vi.waitFor(async () => expect(await calls.of(id)).not.toEqual([]));
    expect((await calls.of(id)).map((note) => note.action)).toEqual(['list_things']);
  });

  it('is the opening of a conversation, its notifications and the request for the list of actions (contract 15, D1)', async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'TOKEN');
    await agent.listTools();
    // A real call afterwards: once its note is there, any note of the messages before it would be too.
    await agent.callTool({ name: 'list_things', arguments: {} });
    await agent.close();

    await vi.waitFor(async () => expect(await calls.of(id)).not.toEqual([]));
    expect((await calls.of(id)).map((note) => note.action)).toEqual(['list_things']);
  });

  it('is a call at the address of an unknown MCP (contract 23)', async () => {
    const real = createMcpCalls(database);
    const notedFor: string[] = [];
    const recording: McpCalls = {
      write: (connectorId, notes) => {
        notedFor.push(connectorId);
        return real.write(connectorId, notes);
      },
      of: real.of,
    };
    const noting = createApp({ nodeEnv: 'test', hostedStore: store, mcpCalls: recording, now, auth: account.auth }).listen(0);
    await new Promise<void>((r) => noting.once('listening', r));
    const notingBase = `http://127.0.0.1:${(noting.address() as AddressInfo).port}`;
    try {
      const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);

      const unknown = await postBatch(`${notingBase}/m/nope-unknown-id`, [toolCall(1, 'list_things', {})]);
      // A real call afterwards: once it is noted, a note for the unknown address would have been written too.
      await postBatch(`${notingBase}/m/${id}`, [toolCall(1, 'list_things', {})]);

      await vi.waitFor(() => expect(notedFor).not.toEqual([]));
      expect({ unknown, notedFor }).toEqual({ unknown: '{"error":"Unknown MCP id."}', notedFor: [id] });
    } finally {
      await new Promise<void>((r) => noting.close(() => r()));
    }
  });

  it("is any of the values the agent sent, the API's response or error message, or the token (contract 17, D3)", async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'AGENT-TOKEN-0158');
    await agent.callTool({ name: 'create_thing', arguments: { title: 'AGENT-VALUE-0158' } });
    await agent.callTool({ name: 'delete_thing', arguments: { id: 'echo' } });
    await agent.callTool({ name: 'delete_thing', arguments: { id: '404' } });
    await agent.close();

    await vi.waitFor(async () => expect(await calls.of(id)).toHaveLength(3));
    const noted = await database.rows<{ row: string }>(
      sql`select row_to_json(c)::text as row from connector_calls c where connector_id = ${id}`
    );
    expect(noted.filter(({ row }) => /AGENT-TOKEN|AGENT-VALUE|API-RESPONSE-BODY|API-ERROR-MESSAGE|echo/.test(row))).toEqual([]);
  });
});

// WAT-157 — noting a call never slows the agent down, nor fails it.
describe('noting a call', () => {
  /** An app reading connectors from the file's database, writing notes with `notes`. */
  async function appNotingWith(notes: McpCalls): Promise<{ base: string; close(): Promise<void> }> {
    const noting = createApp({ nodeEnv: 'test', hostedStore: store, mcpCalls: notes, now, auth: account.auth }).listen(0);
    await new Promise<void>((r) => noting.once('listening', r));
    return {
      base: `http://127.0.0.1:${(noting.address() as AddressInfo).port}`,
      close: () => new Promise<void>((r) => noting.close(() => r())),
    };
  }

  it("gives the agent the API's answer, without any error added, when the database refuses the note, and logs it (contract 18, D7)", async () => {
    const refusingDb = await createTestDatabase();
    const refusing = openDatabase(refusingDb.config);
    await migrateDatabase(refusing);
    await refusing.close();
    const noting = await appNotingWith(createMcpCalls(refusing));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);

      const agent = await connectAgent(`${noting.base}/m/${id}`, 'TOKEN');
      const answer = await agent.callTool({ name: 'list_things', arguments: {} });
      await agent.close();

      expect(answer).toEqual({ content: [{ type: 'text', text: '{\n  "ok": true\n}' }] });
      await vi.waitFor(() => expect(logged).toHaveBeenCalledWith('[hosted-mcp] noting calls failed:', expect.any(String)));
    } finally {
      logged.mockRestore();
      await noting.close();
      await refusingDb.dispose();
    }
  });

  it('gives the agent its answer while the database still takes its time to write the note (contract 18, D7)', async () => {
    // The database is outside SLICE: this one starts every write and finishes none before the test says so.
    let writesStarted = 0;
    let finishWrites = () => {};
    const slow: McpCalls = {
      write: () => {
        writesStarted += 1;
        return new Promise<void>((resolve) => (finishWrites = resolve));
      },
      of: () => Promise.resolve([]),
    };
    const noting = await appNotingWith(slow);
    try {
      const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);

      const agent = await connectAgent(`${noting.base}/m/${id}`, 'TOKEN');
      const answer = await agent.callTool({ name: 'list_things', arguments: {} });
      await agent.close();

      expect(answer.isError ?? false).toBe(false);
      await vi.waitFor(() => expect(writesStarted).toBe(1));
    } finally {
      finishWrites();
      await noting.close();
    }
  });

  it('notes the call with the result the agent would have read when the agent leaves before the answer (D7)', async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);
    received = [];
    let answerTheApi = () => {};
    beforeAnswer = () => new Promise<void>((resolve) => (answerTheApi = resolve));
    const leaving = new AbortController();

    const request = fetch(`${baseUrl}/m/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(toolCall(1, 'list_things', {})),
      signal: leaving.signal,
    }).then((res) => res.text());
    await vi.waitFor(() => expect(received).toHaveLength(1));
    leaving.abort();
    await expect(request).rejects.toThrow();
    answerTheApi();

    await vi.waitFor(async () => expect((await calls.of(id)).map((note) => note.result)).toEqual([{ kind: 'succeeded' }]));
  });

  it("gives the agent the API's answer once its MCP has 10,000 notes that day, and notes nothing more (contract 19, D8)", async () => {
    const { id } = await store.put(withApiActions(threeActions()), account.workspaceId, CREATED);
    await calls.write(
      id,
      Array.from({ length: 10_000 }, (_, n) => ({
        action: 'list_things',
        version: 1,
        calledAt: new Date(CREATED.getTime() - n),
        result: { kind: 'succeeded' as const },
        durationMs: 120,
      }))
    );
    let written = () => {};
    const writeDone = new Promise<void>((resolve) => (written = resolve));
    const noting = await appNotingWith({
      write: async (connectorId, notes) => {
        await calls.write(connectorId, notes);
        written();
      },
      of: (connectorId) => calls.of(connectorId),
    });
    try {
      const agent = await connectAgent(`${noting.base}/m/${id}`, 'TOKEN');
      const answer = await agent.callTool({ name: 'list_things', arguments: {} });
      await agent.close();
      await writeDone;

      expect({ answer, notes: (await calls.of(id)).length }).toEqual({
        answer: { content: [{ type: 'text', text: '{\n  "ok": true\n}' }] },
        notes: 10_000,
      });
    } finally {
      await noting.close();
    }
  });
});

const ACTION_GONE_TEXT =
  'This action is no longer available in this MCP. Start a new conversation to get the current list of actions.';

/** The JSON-RPC messages of an answer sent as a stream of server-sent events. */
function sseMessages(answer: string): Array<{ id?: unknown; result?: unknown }> {
  return answer
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)) as { id?: unknown; result?: unknown });
}

/** An address where nothing listens: a port just released. */
async function closedAddress(): Promise<string> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((r) => server.close(() => r()));
  return `http://127.0.0.1:${port}`;
}

/** Two actions: the agent may only read things, or only create them, as the user checks. */
const READ_AND_WRITE_SPEC = `openapi: 3.0.3
info: { title: Demo, version: "1.0" }
servers: [{ url: http://placeholder }]
paths:
  /things:
    get:
      operationId: listThings
      summary: List things
      responses: { '200': { description: ok } }
    post:
      operationId: createThing
      summary: Create a thing
      responses: { '201': { description: created } }
`;

/** Create an MCP from screen 4 with `selectedIds` checked among the actions of `rawSpec`. */
async function hostSelection(rawSpec: string, selectedIds: string[]): Promise<string> {
  const res = await fetch(`${baseUrl}/api/host`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: account.cookie },
    body: JSON.stringify({
      parsedSpec: {},
      rawSpec,
      selectedIds,
      config: {
        mcpName: 'demo',
        baseUrl: upstreamUrl,
        upstreamAuth: { type: 'bearer' },
        hosting: 'cloud',
        mode: 'remote',
        includeParamDescriptions: false,
        retryOnServerError: false,
      },
    }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: string }).id;
}

// WAT-141 — the selection made on screens 2 and 3 becomes the MCP's version 1.
describe('the versions of an MCP created from screen 4', () => {
  it('start with a version 1, active since its creation, holding exactly the checked actions (contract 1, 9)', async () => {
    const id = await hostSelection(READ_AND_WRITE_SPEC, ['POST /things']);

    const res = await fetch(`${baseUrl}/api/mcps/${id}/versions`, { headers: { cookie: account.cookie } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      apiName: 'Demo',
      versions: [
        {
          number: 1,
          createdAt: '2026-10-24T09:00:00.000Z',
          activeSince: '2026-10-24T09:00:00.000Z',
          actionLabels: ['Create a thing'],
        },
      ],
    });
  });
});

async function host(): Promise<string> {
  const res = await hostRequest(baseUrl);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { id: string; url: string };
  expect(body.url).toContain('/m/');
  return body.url;
}

async function callListThings(url: string, token: string): Promise<void> {
  const client = new Client({ name: 'agent', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  await client.callTool({ name: 'list_things', arguments: {} });
  await client.close();
}

describe('hosted runtime routes', () => {
  it('hosts a config and serves it; two agents in parallel each relay their own token', async () => {
    received = [];
    const url = await host();

    await Promise.all([callListThings(url, 'TOKEN_A'), callListThings(url, 'TOKEN_B')]);

    const auths = received.map((r) => r.auth).sort();
    expect(received.every((r) => r.url === '/things')).toBe(true);
    expect(auths).toEqual(['Bearer TOKEN_A', 'Bearer TOKEN_B']);
  }, 20_000);

  // WAT-102 (D2) — an MCP no longer expires, whatever SLICE_HOSTED_TTL_HOURS says.
  it('still serves its actions 73 h and 31 days after creation, with SLICE_HOSTED_TTL_HOURS=72', async () => {
    vi.stubEnv('SLICE_HOSTED_TTL_HOURS', '72');
    const ttl72 = createApp({ nodeEnv: 'test', hostedStore: store, now, auth: account.auth }).listen(0);
    await new Promise<void>((r) => ttl72.once('listening', r));
    const ttl72Base = `http://127.0.0.1:${(ttl72.address() as AddressInfo).port}`;
    try {
      received = [];
      const id = (await host()).split('/m/')[1]!;

      clock = hoursAfterCreation(73);
      await callListThings(`${ttl72Base}/m/${id}`, 'TOKEN_73H');
      clock = hoursAfterCreation(31 * 24);
      await callListThings(`${ttl72Base}/m/${id}`, 'TOKEN_31D');

      expect(received.map((r) => r.auth)).toEqual(['Bearer TOKEN_73H', 'Bearer TOKEN_31D']);
    } finally {
      await new Promise<void>((r) => ttl72.close(() => r()));
      vi.unstubAllEnvs();
    }
  }, 20_000);

  it('POST /api/host answers with the id and the URL of the MCP, and no expiry date', async () => {
    const res = await hostRequest(baseUrl);

    expect(res.status).toBe(200);
    expect(Object.keys((await res.json()) as object).sort()).toEqual(['id', 'url']);
  });

  it('lets an agent call a hosted MCP from any site (CORS open on /m)', async () => {
    const res = await fetch(`${baseUrl}/m/some-id`, {
      method: 'OPTIONS',
      headers: { origin: 'https://agent.example', 'access-control-request-method': 'POST' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await fetch(`${baseUrl}/m/nope-unknown-id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects a private/loopback baseUrl with 400 BLOCKED_HOST when the SSRF guard is on', async () => {
    // A production-like instance: allowPrivateHosts off → guard active.
    const guarded = createApp({ nodeEnv: 'test', allowPrivateHosts: false, hostedStore: store, auth: account.auth }).listen(0);
    await new Promise<void>((r) => guarded.once('listening', r));
    const guardedUrl = `http://127.0.0.1:${(guarded.address() as AddressInfo).port}`;
    try {
      const res = await fetch(`${guardedUrl}/api/host`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: account.cookie },
        body: JSON.stringify({
          parsedSpec: {},
          rawSpec: SPEC,
          selectedIds: ['GET /things'],
          config: {
            mcpName: 'demo',
            baseUrl: 'http://169.254.169.254/latest/meta-data/',
            upstreamAuth: { type: 'none' },
            hosting: 'cloud',
            mode: 'remote',
            includeParamDescriptions: false,
            retryOnServerError: false,
          },
        }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('BLOCKED_HOST');
    } finally {
      await new Promise<void>((r) => guarded.close(() => r()));
    }
  });
});

// WAT-101 — nothing is created without an account (contract 15).
describe('creating an MCP without a session', () => {
  it('is refused with 401 and stores nothing', async () => {
    const before = await database.rows(sql`select id from connectors`);

    const res = await hostRequest(baseUrl, { cookie: '' });

    expect(res.status).toBe(401);
    expect(await database.rows(sql`select id from connectors`)).toEqual(before);
  });
});

function hostRequest(base: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}/api/host`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: account.cookie, ...headers },
    body: JSON.stringify({
      parsedSpec: {},
      rawSpec: SPEC,
      selectedIds: ['GET /things'],
      config: {
        mcpName: 'demo',
        baseUrl: upstreamUrl,
        upstreamAuth: { type: 'bearer' },
        hosting: 'cloud',
        mode: 'remote',
        includeParamDescriptions: false,
        retryOnServerError: false,
      },
    }),
  });
}

describe('hosted routes when the database is unreachable', () => {
  let downDb: TestDatabase;
  let down: Database;
  let downApp: Server;
  let downBase: string;
  let existingId: string;

  beforeAll(async () => {
    downDb = await createTestDatabase();
    down = openDatabase(downDb.config);
    await migrateDatabase(down);
    // Signed in on the file's healthy database: these tests are about the connectors' storage.
    downApp = createApp({ nodeEnv: 'test', hostedStore: createHostedStore(down), auth: account.auth }).listen(0);
    await new Promise<void>((r) => downApp.once('listening', r));
    downBase = `http://127.0.0.1:${(downApp.address() as AddressInfo).port}`;
    const { workspaceId } = await createTestAccount({ database: down });
    existingId = (await createHostedStore(down).put(threeActions(), workspaceId, new Date())).id;
    await down.close();
  });

  afterAll(async () => {
    await new Promise<void>((r) => (downApp ? downApp.close(() => r()) : r()));
    await downDb?.dispose();
  });

  it('refuses a creation with SERVICE_UNAVAILABLE and a clear message', async () => {
    const res = await hostRequest(downBase);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Hosting is unavailable for the moment. Try again in a few minutes.',
    });
  });

  it('answers unavailable for the moment, never unknown, at an existing address', async () => {
    const res = await fetch(`${downBase}/m/${existingId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'This MCP is unavailable for the moment. Try again in a few minutes.' });
  });

  it('reports the server unhealthy', async () => {
    const res = await fetch(`${downBase}/api/health`);

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, status: 'database unreachable' });
  });
});

// WAT-92 — a storage error that is not an outage is a server error, never "unavailable".
describe('hosted routes when storing or reading fails for another reason', () => {
  let buggyApp: Server;
  let buggyBase: string;

  beforeAll(async () => {
    const constraintViolation = Object.assign(new Error('violates check constraint'), { code: '23514' });
    const buggy: HostedStore = {
      put: () => Promise.reject(new Error('Failed query: insert', { cause: constraintViolation })),
      get: () => Promise.reject(new TypeError("Cannot read properties of undefined (reading 'params')")),
      apiActions: () => Promise.resolve([]),
      purgeExpired: () => Promise.resolve(),
      ping: () => Promise.resolve(),
    };
    buggyApp = createApp({ nodeEnv: 'test', hostedStore: buggy, auth: account.auth }).listen(0);
    await new Promise<void>((r) => buggyApp.once('listening', r));
    buggyBase = `http://127.0.0.1:${(buggyApp.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => (buggyApp ? buggyApp.close(() => r()) : r()));
  });

  it('refuses a creation with a server error, not SERVICE_UNAVAILABLE', async () => {
    const res = await hostRequest(buggyBase);

    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('SERVICE_UNAVAILABLE');
  });

  it('answers a server error, not unavailable, at an address', async () => {
    const res = await fetch(`${buggyBase}/m/some-id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });

    expect(res.status).toBe(500);
  });

  it('keeps the server healthy: the database itself answers', async () => {
    const res = await fetch(`${buggyBase}/api/health`);

    expect(res.status).toBe(200);
  });
});
