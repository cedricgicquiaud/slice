// WAT-103/104/105 — `GET /api/mcps` and `DELETE /api/mcps/:id`: an account's own MCPs, never another's.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app';
import { createAccountMcps } from '../services/account-mcps';
import { createHostedStore, type HostedStore } from '../services/hosted-store';
import type { HostedMcpConfig } from '../services/hosted-mcp-factory';
import { openDatabase, type Database } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { createTestDatabase, type TestDatabase } from '../db/test-database';
import { createTestAccount, type TestAccount } from '../db/test-account';

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
