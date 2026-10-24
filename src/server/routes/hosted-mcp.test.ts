// E2E for the hosted runtime routes (Pivot-4): POST /api/host stores a config
// and returns a URL; /m/:id serves the MCP, multi-session (several agents in
// parallel), relaying each caller's own token to the upstream.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';
import { createApp } from '../app';
import { createHostedStore, type HostedStore } from '../services/hosted-store';
import type { HostedMcpConfig } from '../services/hosted-mcp-factory';
import { openDatabase, type Database } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { createTestDatabase, type TestDatabase } from '../db/test-database';
import { createTestAccount, type TestAccount } from '../db/test-account';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

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
let testDb: TestDatabase;
let database: Database;
let store: HostedStore;
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
});

beforeAll(async () => {
  upstream = createServer((req, res) => {
    received.push({ url: req.url ?? '', auth: req.headers.authorization, apiKey: req.headers['x-api-key'] as string | undefined });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((r) => upstream.listen(0, r));
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

  testDb = await createTestDatabase();
  database = openDatabase(testDb.config);
  await migrateDatabase(database);
  store = createHostedStore(database);
  account = await createTestAccount({ database });

  app = createApp({ nodeEnv: 'test', hostedStore: store, now, auth: account.auth }).listen(0);
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

describe('hosted connector served from the database', () => {
  it('serves its actions in order, with their parameters and read/write labels', async () => {
    const { id } = await store.put(threeActions(), new Date());

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

  it('gives a connector created from screen 4 a 22-character address kept in the database', async () => {
    const url = await host();
    const id = url.split('/m/')[1]!;

    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((await store.get(id))?.endpoints.map((e) => e.name)).toEqual(['list_things']);
  });

  it("relays the agent's API key in the header the API expects", async () => {
    received = [];
    const { id } = await store.put(
      { ...threeActions(), upstreamAuth: { type: 'apiKey', headerName: 'X-Api-Key' } },
      new Date()
    );

    const agent = await connectAgent(`${baseUrl}/m/${id}`, 'KEY-123');
    await agent.callTool({ name: 'list_things', arguments: {} });
    await agent.close();

    expect(received.map((r) => r.apiKey)).toEqual(['KEY-123']);
  });

  it('keeps no upstream key or token in the database', async () => {
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

    const everything = await database.rows<{ row: string }>(
      sql`select row_to_json(c)::text as row from connectors c
          union all select row_to_json(a)::text from connector_actions a`
    );
    expect(everything.length).toBeGreaterThan(0);
    expect(everything.filter((r) => /feedface|AGENT-SECRET/.test(r.row))).toEqual([]);
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

  it('answers expired at the first visit after the 72 h and at the following ones', async () => {
    const url = await host();
    clock = hoursAfterCreation(73);

    const visit = () =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });
    const first = await visit();
    const second = await visit();

    expect([first.status, second.status]).toEqual([410, 410]);
  });

  it('never expires a hosted URL when TTL is 0 (self-host deployments)', async () => {
    const ttl0 = createApp({ nodeEnv: 'test', hostedStore: store, hostedTtlHours: 0, now, auth: account.auth }).listen(0);
    await new Promise<void>((r) => ttl0.once('listening', r));
    const ttl0Base = `http://127.0.0.1:${(ttl0.address() as AddressInfo).port}`;
    try {
      received = [];
      const url = await host();
      const id = url.split('/m/')[1]!;
      clock = hoursAfterCreation(100);

      // Same database — the TTL-0 app serves the same id and must not expire it.
      await callListThings(`${ttl0Base}/m/${id}`, 'TOKEN_C');
      expect(received.some((r) => r.auth === 'Bearer TOKEN_C')).toBe(true);
      expect(await store.get(id)).toBeDefined();
    } finally {
      await new Promise<void>((r) => ttl0.close(() => r()));
    }
  }, 20_000);

  it('POST /api/host returns expiresAt aligned with the TTL (null when TTL is 0)', async () => {
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
          upstreamAuth: { type: 'bearer' },
          hosting: 'cloud',
          mode: 'remote',
          includeParamDescriptions: false,
          retryOnServerError: false,
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; expiresAt: string | null };
    // Default TTL is 72h — created 2026-10-24 09:00 UTC, expires three days later.
    expect(body.expiresAt).toBe('2026-10-27T09:00:00.000Z');

    // TTL 0 (self-host) → no expiry advertised.
    const ttl0 = createApp({ nodeEnv: 'test', hostedStore: store, hostedTtlHours: 0, now, auth: account.auth }).listen(0);
    await new Promise<void>((r) => ttl0.once('listening', r));
    try {
      const res0 = await fetch(`http://127.0.0.1:${(ttl0.address() as AddressInfo).port}/api/host`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: account.cookie },
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
      const body0 = (await res0.json()) as { expiresAt: string | null };
      expect(body0.expiresAt).toBeNull();
    } finally {
      await new Promise<void>((r) => ttl0.close(() => r()));
    }
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

function hostRequest(base: string): Promise<Response> {
  return fetch(`${base}/api/host`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: account.cookie },
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
    existingId = (await createHostedStore(down).put(threeActions(), new Date())).id;
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
