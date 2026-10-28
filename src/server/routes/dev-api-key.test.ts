// WAT-170 — the recette primer makes the key of an MCP unreadable, as a changed
// SLICE_ENCRYPTION_KEY would (D17); production never lets it.
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { createApp, type CreateAppOptions } from '../app';
import { createAccountMcps } from '../services/account-mcps';
import { createHostedStore, type HostedStore } from '../services/hosted-store';
import { createKeyCipher } from '../services/key-cipher';
import { createMcpApiKeys, type McpApiKeys } from '../services/mcp-api-key';
import type { HostedMcpConfig } from '../services/hosted-mcp-factory';
import { createTestAccount, type TestAccount } from '../db/test-account';
import { DATABASE_TEST_TIMEOUTS } from '../db/test-database';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

const CREATED = new Date('2026-10-21T10:15:00.000Z');
const SAVED = new Date('2026-10-28T09:30:00.000Z');

const NOTION: HostedMcpConfig = {
  name: 'notion',
  apiName: 'Notion API',
  baseUrl: 'https://api.notion.com/v1',
  upstreamAuth: { type: 'bearer' },
  endpoints: [{ name: 'search', description: 'Search', method: 'POST', path: '/search', params: [] }],
};

let account: TestAccount;
let store: HostedStore;
let apiKeys: McpApiKeys;

beforeAll(async () => {
  account = await createTestAccount();
  store = createHostedStore(account.database);
  apiKeys = createMcpApiKeys(account.database, createKeyCipher(randomBytes(32)));
});

afterAll(async () => {
  await account?.dispose();
});

/** SLICE as `pnpm dev` or the tests run it, its MCPs' keys under the encryption key of `apiKeys`. */
function sliceApp(options: CreateAppOptions = {}) {
  return createApp({
    nodeEnv: 'test',
    hostedStore: store,
    accountMcps: createAccountMcps(account.database),
    mcpApiKeys: apiKeys,
    mcpApiKeysUnderAnotherKey: createMcpApiKeys(account.database, createKeyCipher(randomBytes(32))),
    auth: account.auth,
    ...options,
  });
}

/** An MCP of the account with a key saved on `SAVED`. */
async function mcpWithAKey(): Promise<string> {
  const { id } = await store.put(NOTION, account.workspaceId, CREATED);
  await apiKeys.save(id, randomBytes(30).toString('base64url'), SAVED);
  return id;
}

describe('POST /api/dev/mcps/:id/api-key/garble', () => {
  it('makes the key of my MCP unreadable, dated from its saving, outside production (D17)', async () => {
    const id = await mcpWithAKey();
    const app = sliceApp();

    const garbled = await request(app).post(`/api/dev/mcps/${id}/api-key/garble`).set('cookie', account.cookie);
    const read = await request(app).get(`/api/mcps/${id}/api-key`).set('cookie', account.cookie);

    expect({ garbled: garbled.status, read: read.body }).toEqual({
      garbled: 204,
      read: { apiKey: { savedAt: '2026-10-28T09:30:00.000Z', readable: false } },
    });
  });

  it('does not exist when NODE_ENV=production: the key stays readable (D17)', async () => {
    const id = await mcpWithAKey();
    const app = sliceApp({ nodeEnv: 'production' });

    const garbled = await request(app).post(`/api/dev/mcps/${id}/api-key/garble`).set('cookie', account.cookie);

    expect({ garbled: garbled.status, state: await apiKeys.stateOf(id) }).toEqual({
      garbled: 404,
      state: { savedAt: SAVED, readable: true },
    });
  });

  it("answers another account's MCP exactly as an unknown id, its key staying readable (D13)", async () => {
    const other = await createTestAccount({ database: account.database, email: 'neighbour-garble@example.com' });
    const { id } = await store.put(NOTION, other.workspaceId, CREATED);
    await apiKeys.save(id, randomBytes(30).toString('base64url'), SAVED);
    const app = sliceApp();

    const theirs = await request(app).post(`/api/dev/mcps/${id}/api-key/garble`).set('cookie', account.cookie);
    const unknown = await request(app).post('/api/dev/mcps/no-such-mcp-id/api-key/garble').set('cookie', account.cookie);

    expect({
      theirs: { status: theirs.status, body: theirs.text },
      unknown: { status: unknown.status, body: unknown.text },
      state: await apiKeys.stateOf(id),
    }).toEqual({
      theirs: { status: 404, body: '{"code":"NOT_FOUND","message":"Unknown MCP id."}' },
      unknown: { status: 404, body: '{"code":"NOT_FOUND","message":"Unknown MCP id."}' },
      state: { savedAt: SAVED, readable: true },
    });
  });
});
