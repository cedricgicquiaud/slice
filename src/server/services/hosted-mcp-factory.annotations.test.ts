/**
 * WAT-60 — the hosted MCP tells the agent which actions only read.
 * Same rule as screen 2's Reads/Writes filter: GET reads, anything else writes
 * and is treated as possibly destructive. The four hints are always explicit.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { HttpMethod } from '@shared/types';
import { buildHostedMcpServer, type HostedMcpConfig } from './hosted-mcp-factory';

const endpoint = (name: string, method: string) => ({
  name,
  description: `${name} description`,
  method: method as HttpMethod,
  path: `/${name}`,
  params: [{ name: 'id', in: 'query' as const, type: 'string', required: false }],
});

// No `createdAt`: shaped like a record stored before this change.
const config: HostedMcpConfig = {
  name: 'annotated',
  baseUrl: 'https://api.example.com',
  upstreamAuth: { type: 'bearer' },
  endpoints: [
    endpoint('read_get', 'GET'),
    endpoint('write_post', 'POST'),
    endpoint('write_put', 'PUT'),
    endpoint('write_patch', 'PATCH'),
    endpoint('write_delete', 'DELETE'),
    endpoint('read_lowercase', 'get'),
    endpoint('write_unknown', 'HEAD'),
  ],
};

let client: Client;
let tools: Map<string, Tool>;

beforeAll(async () => {
  const server = buildHostedMcpServer(config);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  client = new Client({ name: 'annotations-test', version: '0.0.0' });
  await client.connect(clientSide);
  const listed = await client.listTools();
  tools = new Map(listed.tools.map((t) => [t.name, t]));
});

afterAll(async () => {
  await client?.close();
});

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };

describe('hosted MCP tool annotations (WAT-60)', () => {
  it('sends a GET action as read-only, non-destructive, idempotent', () => {
    expect(tools.get('read_get')?.annotations).toEqual(READ);
  });

  it.each(['write_post', 'write_put', 'write_patch', 'write_delete'])(
    'sends %s as a possibly destructive, non-idempotent write',
    (name) => {
      expect(tools.get(name)?.annotations).toEqual(WRITE);
    },
  );

  it('treats a lowercase stored method like its uppercase form', () => {
    expect(tools.get('read_lowercase')?.annotations).toEqual(READ);
  });

  it('never sends a non-GET action as read-only, even with an unknown method', () => {
    expect(tools.get('write_unknown')?.annotations).toEqual(WRITE);
  });

  it('sends all four hints explicitly on every action, and no title', () => {
    for (const tool of tools.values()) {
      const a = tool.annotations ?? {};
      expect(Object.keys(a).sort()).toEqual(
        ['destructiveHint', 'idempotentHint', 'openWorldHint', 'readOnlyHint'],
      );
      expect(tool.title).toBeUndefined();
    }
  });

  it('keeps name, description and parameters unchanged', () => {
    const t = tools.get('write_post');
    expect(t?.description).toBe('write_post description');
    expect(Object.keys(t?.inputSchema.properties ?? {})).toEqual(['id']);
  });
});
