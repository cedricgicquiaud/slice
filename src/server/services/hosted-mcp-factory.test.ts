// Core of the shared hosted runtime (Pivot-4): build an McpServer in-memory
// from a stored config, serve it, and relay the caller's token to the upstream
// — proving one engine can BE any MCP from data, at request time.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildHostedMcpServer, relayStore, type HostedMcpConfig } from './hosted-mcp-factory';
import type { CallResult } from './mcp-calls';
import type { McpApiKey } from './mcp-api-key';
import type { EndpointParam, UpstreamAuth } from '@shared/types';

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });
}

let upstream: Server;
let upstreamPort: number;
let received: Array<{
  url: string;
  method: string | undefined;
  auth: string | undefined;
  version: string | undefined;
  body: unknown;
}> = [];
let mcpHttp: Server;
let mcpPort: number;
let client: Client;

beforeAll(async () => {
  upstreamPort = await freePort();
  upstream = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      received.push({
        url: req.url ?? '',
        method: req.method,
        auth: req.headers.authorization,
        version: req.headers['notion-version'] as string | undefined,
        body: raw.length > 0 ? JSON.parse(raw) : undefined,
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: req.url }));
    });
  });
  await new Promise<void>((r) => upstream.listen(upstreamPort, r));

  const config: HostedMcpConfig = {
    name: 'demo',
    baseUrl: `http://127.0.0.1:${upstreamPort}`,
    upstreamAuth: { type: 'bearer' },
    endpoints: [
      { name: 'list_things', description: 'List things', method: 'GET', path: '/things', params: [] },
      {
        name: 'get_thing',
        description: 'Get one thing',
        method: 'GET',
        path: '/things/{id}',
        params: [{ name: 'id', in: 'path', type: 'string', required: true }],
      },
      {
        name: 'whoami',
        description: 'Whoami — needs a required header param (Notion-Version style)',
        method: 'GET',
        path: '/users/me',
        params: [{ name: 'Notion-Version', in: 'header', type: 'string', required: true }],
      },
      {
        name: 'search',
        description: 'Search with a required body field',
        method: 'POST',
        path: '/search',
        params: [
          { name: 'query', in: 'body', type: 'string', required: true, wireName: 'query' },
          {
            name: 'filter',
            in: 'body',
            required: false,
            wireName: 'filter',
            schema: { type: 'object', additionalProperties: true },
          },
        ],
      },
      {
        name: 'search_open',
        description: 'Search with no required body field',
        method: 'POST',
        path: '/search-open',
        // Faithful to the parser: a flattened body field always carries `schema`.
        params: [
          { name: 'q', in: 'body', type: 'string', required: false, wireName: 'q', schema: { type: 'string' } },
        ],
      },
      {
        name: 'tagged',
        description: 'Body field colliding with a query param',
        method: 'POST',
        path: '/tagged',
        params: [
          { name: 'tag', in: 'query', type: 'string', required: false },
          { name: 'tag_body', in: 'body', type: 'string', required: false, wireName: 'tag' },
        ],
      },
    ],
  };

  // The test upstream is a 127.0.0.1 mock — allow private hosts so the SSRF
  // guard doesn't block the loopback call under test.
  const server = buildHostedMcpServer(config, { allowPrivateHosts: true });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  await server.connect(transport);
  mcpPort = await freePort();
  mcpHttp = createServer((req, res) => {
    const authorization = req.headers.authorization ?? '';
    relayStore.run({ authorization }, () => {
      void transport.handleRequest(req, res);
    });
  });
  await new Promise<void>((r) => mcpHttp.listen(mcpPort, r));

  client = new Client({ name: 'test', version: '0.0.0' });
  const t = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${mcpPort}/`), {
    requestInit: { headers: { Authorization: 'Bearer USERTOKEN' } },
  });
  await client.connect(t);
}, 20_000);

afterAll(async () => {
  await client?.close();
  await new Promise<void>((r) => (mcpHttp ? mcpHttp.close(() => r()) : r()));
  await new Promise<void>((r) => (upstream ? upstream.close(() => r()) : r()));
});

describe('buildHostedMcpServer — runtime MCP from config', () => {
  it('exposes one tool per endpoint in the config', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'get_thing',
      'list_things',
      'search',
      'search_open',
      'tagged',
      'whoami',
    ]);
  });

  it('proxies a tool call to the upstream, substituting path params and relaying the token', async () => {
    received = [];
    await client.callTool({ name: 'get_thing', arguments: { id: '42' } });
    const last = received.at(-1);
    expect(last?.url).toBe('/things/42');
    expect(last?.auth).toBe('Bearer USERTOKEN');
  });

  it('forwards `in: header` params to the upstream request headers (e.g. Notion-Version)', async () => {
    received = [];
    await client.callTool({ name: 'whoami', arguments: { 'Notion-Version': '2022-06-28' } });
    const last = received.at(-1);
    expect(last?.url).toBe('/users/me');
    expect(last?.version).toBe('2022-06-28');
    // Auth relay still wins — a header param must not clobber the token.
    expect(last?.auth).toBe('Bearer USERTOKEN');
  });

  it('reassembles in:body params into the JSON request body (R-B9)', async () => {
    received = [];
    await client.callTool({
      name: 'search',
      arguments: { query: 'hello', filter: { kind: 'page' } },
    });
    const last = received.at(-1);
    expect(last?.method).toBe('POST');
    expect(last?.url).toBe('/search'); // body fields are NOT in the URL (R-B11)
    expect(last?.body).toEqual({ query: 'hello', filter: { kind: 'page' } });
    expect(last?.auth).toBe('Bearer USERTOKEN'); // auth intact (R-B11)
  });

  it('sends {} when an object-body endpoint gets no field (R-B10)', async () => {
    received = [];
    await client.callTool({ name: 'search_open', arguments: {} });
    const last = received.at(-1);
    expect(last?.body).toEqual({});
  });

  it('a missing required body field fails validation — no upstream call (R-B13)', async () => {
    received = [];
    const res = await client.callTool({ name: 'search', arguments: {} });
    // The SDK surfaces a validation failure as an error result (not a throw);
    // the invariant that matters is that the upstream was never called.
    expect(res.isError).toBe(true);
    expect(received).toHaveLength(0);
  });

  it('writes a collided body field under its real wire name (R-B7)', async () => {
    received = [];
    await client.callTool({ name: 'tagged', arguments: { tag_body: 'urgent' } });
    const last = received.at(-1);
    expect(last?.body).toEqual({ tag: 'urgent' }); // wire name, not the tool key
  });

  // OAuth-1c: a hosted oauth2 upstream relays the caller's bearer exactly like
  // `bearer` — SLICE Cloud never fetches a token (R21/R22). The tokenUrl/scopes
  // in the config are ignored by the runtime (the auto flow is self-host only).
  it('relays the caller bearer for an oauth2 upstream, never calling the token endpoint (R21/R22)', async () => {
    received = [];
    const oauthConfig: HostedMcpConfig = {
      name: 'oauth-demo',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      upstreamAuth: { type: 'oauth2', tokenUrl: 'https://never.called/token', scopes: ['read'] },
      endpoints: [
        { name: 'list_things', description: 'List', method: 'GET', path: '/things', params: [] },
      ],
    };
    const srv = buildHostedMcpServer(oauthConfig, { allowPrivateHosts: true });
    const tr = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
    await srv.connect(tr);
    const port = await freePort();
    const http = createServer((req, res) => {
      const authorization = req.headers.authorization ?? '';
      relayStore.run({ authorization }, () => {
        void tr.handleRequest(req, res);
      });
    });
    await new Promise<void>((r) => http.listen(port, r));
    const c = new Client({ name: 'oauth-test', version: '0.0.0' });
    const ct = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/`), {
      requestInit: { headers: { Authorization: 'Bearer OAUTH_USER_TOKEN' } },
    });
    await c.connect(ct);
    try {
      await c.callTool({ name: 'list_things', arguments: {} });
      const last = received.at(-1);
      expect(last?.url).toBe('/things');
      expect(last?.auth).toBe('Bearer OAUTH_USER_TOKEN');
    } finally {
      await c.close();
      await new Promise<void>((r) => http.close(() => r()));
    }
  }, 20_000);
});

describe('an action whose API takes its time (D5)', () => {
  let slowApi: Server;
  let slowApiUrl: string;
  /** How long the API waits before it answers; `Infinity` never answers. */
  let answerAfterMs = Infinity;
  /** Whether the API, never answering, still sends its headers first: then only its body is missing. */
  let sendsHeadersFirst = false;
  /** Settled once the API received a call. */
  let reached: () => void = () => {};
  /** Settled once the API saw its caller leave a call it had not answered. */
  let left: () => void = () => {};

  beforeAll(async () => {
    slowApi = createServer((_req, res) => {
      reached();
      res.once('close', () => {
        if (!res.writableEnded) left();
      });
      if (answerAfterMs === Infinity) {
        if (sendsHeadersFirst) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.flushHeaders();
        }
        return;
      }
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }, answerAfterMs);
    });
    await new Promise<void>((r) => slowApi.listen(0, '127.0.0.1', r));
    slowApiUrl = `http://127.0.0.1:${(slowApi.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    slowApi.closeAllConnections();
    await new Promise<void>((r) => slowApi.close(() => r()));
  });

  /**
   * An agent connected to an MCP of the slow API, whose engine waits `upstreamTimeoutMs` at most,
   * and what the engine told of each action call.
   */
  async function agentOfSlowApi(
    upstreamTimeoutMs: number | undefined
  ): Promise<{ agent: Client; told: CallResult[]; close(): Promise<void> }> {
    const told: CallResult[] = [];
    const srv = buildHostedMcpServer(
      {
        name: 'slow',
        baseUrl: slowApiUrl,
        upstreamAuth: { type: 'bearer' },
        endpoints: [{ name: 'list_things', description: 'List', method: 'GET', path: '/things', params: [] }],
      },
      { allowPrivateHosts: true, upstreamTimeoutMs }
    );
    const tr = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
    await srv.connect(tr);
    const http = createServer((req, res) => {
      const onActionResult = (_requestId: string | number, result: CallResult) => told.push(result);
      relayStore.run({ authorization: 'Bearer USERTOKEN', onActionResult }, () => {
        void tr.handleRequest(req, res);
      });
    });
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    const agent = new Client({ name: 'slow-test', version: '0.0.0' });
    await agent.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(http.address() as { port: number }).port}/`)));
    return {
      agent,
      told,
      async close() {
        await agent.close();
        http.closeAllConnections();
        await new Promise<void>((r) => http.close(() => r()));
      },
    };
  }

  it('is abandoned when the API has not answered within the delay, and the agent reads an error', async () => {
    answerAfterMs = Infinity;
    const { agent, close } = await agentOfSlowApi(200);
    try {
      const startedAt = performance.now();
      const answer = await agent.callTool({ name: 'list_things', arguments: {} });
      const waitedMs = performance.now() - startedAt;

      expect({ agentError: answer.isError, abandonedInTime: waitedMs >= 200 && waitedMs < 5_000 }).toEqual({
        agentError: true,
        abandonedInTime: true,
      });
    } finally {
      await close();
    }
  });

  it('tells the agent that the API did not answer within the delay', async () => {
    answerAfterMs = Infinity;
    const { agent, close } = await agentOfSlowApi(200);
    try {
      const answer = await agent.callTool({ name: 'list_things', arguments: {} });

      expect(answer.content).toEqual([{ type: 'text', text: 'The API did not answer within 0.2 seconds.' }]);
    } finally {
      await close();
    }
  });

  it('is told "API unreachable" when it is abandoned (D4)', async () => {
    answerAfterMs = Infinity;
    const { agent, told, close } = await agentOfSlowApi(200);
    try {
      await agent.callTool({ name: 'list_things', arguments: {} });

      expect(told).toEqual([{ kind: 'api_unreachable' }]);
    } finally {
      await close();
    }
  });

  it('is abandoned, and told "API unreachable", when the API sends its headers then stays silent (D5, D4)', async () => {
    answerAfterMs = Infinity;
    sendsHeadersFirst = true;
    const { agent, told, close } = await agentOfSlowApi(200);
    try {
      const startedAt = performance.now();
      const answer = await agent.callTool({ name: 'list_things', arguments: {} });
      const waitedMs = performance.now() - startedAt;

      expect({ agentError: answer.isError, abandonedInTime: waitedMs >= 200 && waitedMs < 5_000, told }).toEqual({
        agentError: true,
        abandonedInTime: true,
        told: [{ kind: 'api_unreachable' }],
      });
    } finally {
      sendsHeadersFirst = false;
      await close();
    }
  });

  it('leaves no request open at the API once abandoned', async () => {
    answerAfterMs = Infinity;
    const { agent, close } = await agentOfSlowApi(200);
    try {
      const apiSawItLeave = new Promise<string>((resolve) => (left = () => resolve('closed')));
      await agent.callTool({ name: 'list_things', arguments: {} });
      const stillOpen = new Promise<string>((resolve) => setTimeout(() => resolve('still open'), 1_000));

      expect(await Promise.race([apiSawItLeave, stillOpen])).toBe('closed');
    } finally {
      await close();
    }
  });

  it('is served normally when the API answers in 29 seconds, the delay being 30 seconds by default', async () => {
    answerAfterMs = 29_000;
    const { agent, told, close } = await agentOfSlowApi(undefined);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const arrived = new Promise<void>((resolve) => (reached = resolve));
      const answering = agent.callTool({ name: 'list_things', arguments: {} });
      await arrived;
      await vi.advanceTimersByTimeAsync(29_000);
      const answer = await answering;

      expect({ agentError: answer.isError ?? false, told }).toEqual({ agentError: false, told: [{ kind: 'succeeded' }] });
    } finally {
      vi.useRealTimers();
      await close();
    }
  });
});

// WAT-173 — the agent's own key passes first; the example text of the snippets is no key.
describe('the key an action call sends to the API', () => {
  let keyApi: Server;
  let keyApiUrl: string;
  /** The headers of each call the API received. */
  let heard: Array<Record<string, string | string[] | undefined>> = [];

  beforeAll(async () => {
    keyApi = createServer((req, res) => {
      heard.push(req.headers);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((r) => keyApi.listen(0, '127.0.0.1', r));
    keyApiUrl = `http://127.0.0.1:${(keyApi.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    keyApi.closeAllConnections();
    await new Promise<void>((r) => keyApi.close(() => r()));
  });

  /**
   * Call the one action of an MCP of the key API, whose access is `upstreamAuth`, as an agent
   * sending `authorization` (none without it) to an MCP whose saved key is `savedKey`.
   */
  async function callWith(
    upstreamAuth: UpstreamAuth,
    { authorization, savedKey, args = {}, params = [] }: {
      authorization?: string;
      savedKey?: McpApiKey;
      args?: Record<string, unknown>;
      params?: EndpointParam[];
    }
  ): Promise<void> {
    const srv = buildHostedMcpServer(
      {
        name: 'keyed',
        baseUrl: keyApiUrl,
        upstreamAuth,
        endpoints: [{ name: 'list_things', description: 'List', method: 'GET', path: '/things', params }],
      },
      { allowPrivateHosts: true }
    );
    const tr = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
    await srv.connect(tr);
    const http = createServer((req, res) => {
      relayStore.run({ authorization: req.headers.authorization ?? '', savedKey }, () => {
        void tr.handleRequest(req, res);
      });
    });
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    const agent = new Client({ name: 'keyed-test', version: '0.0.0' });
    try {
      await agent.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(http.address() as { port: number }).port}/`), {
          requestInit: { headers: authorization === undefined ? {} : { Authorization: authorization } },
        })
      );
      await agent.callTool({ name: 'list_things', arguments: args });
    } finally {
      await agent.close();
      http.closeAllConnections();
      await new Promise<void>((r) => http.close(() => r()));
    }
  }

  const API_KEY: UpstreamAuth = { type: 'apiKey', headerName: 'X-API-Key' };

  it("is the agent's own key when the agent sends one, not the saved key (contract 4, D6)", async () => {
    heard = [];

    await callWith(API_KEY, { authorization: 'Bearer agent-key-0173', savedKey: { key: 'saved-key-0173' } });

    expect(heard.map((headers) => headers['x-api-key'])).toEqual(['agent-key-0173']);
  });

  it('is the saved key when the agent sends the example text of the snippets, Bearer PASTE_YOUR_TOKEN_HERE (contract 4, D6)', async () => {
    heard = [];

    await callWith(API_KEY, { authorization: 'Bearer PASTE_YOUR_TOKEN_HERE', savedKey: { key: 'saved-key-0173' } });

    expect(heard.map((headers) => headers['x-api-key'])).toEqual(['saved-key-0173']);
  });

  it('is the saved key when the agent sends an Authorization the relay refuses: another form than Bearer, a character beyond ASCII (D6)', async () => {
    heard = [];

    await callWith(API_KEY, { authorization: 'Basic YWdlbnQ6c2VjcmV0', savedKey: { key: 'saved-key-0173' } });
    await callWith(API_KEY, { authorization: 'Bearer agent-clé-0173', savedKey: { key: 'saved-key-0173' } });

    expect(heard.map((headers) => headers['x-api-key'])).toEqual(['saved-key-0173', 'saved-key-0173']);
  });

  it("is never replaced by a header parameter the agent sends under the name of the key's header, whatever its case (D6)", async () => {
    heard = [];

    await callWith(API_KEY, {
      savedKey: { key: 'saved-key-0173' },
      params: [{ name: 'x-api-key', in: 'header', type: 'string', required: false }],
      args: { 'x-api-key': 'agent-param-0173' },
    });

    expect(heard.map((headers) => headers['x-api-key'])).toEqual(['saved-key-0173']);
  });
});
