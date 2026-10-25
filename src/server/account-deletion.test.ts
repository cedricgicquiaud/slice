// WAT-107 — once the account is deleted, nothing of it is left: its MCPs' addresses,
// its sessions on every device, its MCPs at the next sign-in (contract 28, D11).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app';
import { createAuth } from './auth/auth';
import { openSession } from './auth/open-session';
import { createAccountMcps } from './services/account-mcps';
import { createHostedStore } from './services/hosted-store';
import { openDatabase, type Database } from './db/client';
import { migrateDatabase } from './db/migrate';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { TEST_AUTH_SECRET } from './db/test-account';

const EMAIL = 'leaving@example.com';

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

let testDb: TestDatabase;
let database: Database;
let app: Server;
let baseUrl: string;
/** The addresses of the account's two MCPs, one created from each device. */
let addresses: string[];

/** "Deploy to SLICE Cloud" from the device holding `cookie`: the new MCP's address. */
async function deployMcp(cookie: string, mcpName: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/host`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      parsedSpec: {},
      rawSpec: SPEC,
      selectedIds: ['GET /things'],
      config: {
        mcpName,
        baseUrl: 'http://127.0.0.1:9',
        upstreamAuth: { type: 'none' },
        hosting: 'cloud',
        mode: 'remote',
        includeParamDescriptions: false,
        retryOnServerError: false,
      },
    }),
  });
  if (res.status !== 200) throw new Error(`deploy answered ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { url: string }).url;
}

/** What an agent plugged on `address` gets when it lists its actions. */
function listActions(address: string): Promise<Response> {
  return fetch(address, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
}

beforeAll(async () => {
  testDb = await createTestDatabase();
  database = openDatabase(testDb.config);
  await migrateDatabase(database);
  const auth = createAuth({ database, secret: TEST_AUTH_SECRET });
  app = createApp({
    nodeEnv: 'test',
    auth,
    hostedStore: createHostedStore(database),
    accountMcps: createAccountMcps(database),
  }).listen(0);
  await new Promise<void>((r) => app.once('listening', r));
  baseUrl = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;

  // The account signed in on two devices, an MCP created from each.
  const laptop = await openSession(auth, EMAIL);
  const phone = await openSession(auth, EMAIL);
  const laptopCookie = `${laptop.name}=${laptop.value}`;
  addresses = [await deployMcp(laptopCookie, 'first'), await deployMcp(`${phone.name}=${phone.value}`, 'second')];

  // Deleted from the laptop, as the page does.
  await fetch(`${baseUrl}/api/auth/delete-user`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: laptopCookie },
    body: '{}',
  });
});

afterAll(async () => {
  await new Promise<void>((r) => (app ? app.close(() => r()) : r()));
  await database?.close();
  await testDb?.dispose();
});

describe('after the account is deleted', () => {
  it('answers 404 Unknown MCP id at every address of its MCPs (contract 28)', async () => {
    const answers = await Promise.all(
      addresses.map(async (address) => {
        const res = await listActions(address);
        return { status: res.status, body: await res.text() };
      })
    );

    expect(answers).toEqual([
      { status: 404, body: '{"error":"Unknown MCP id."}' },
      { status: 404, body: '{"error":"Unknown MCP id."}' },
    ]);
  });
});
