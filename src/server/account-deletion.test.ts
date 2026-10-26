// WAT-107 — once the account is deleted, nothing of it is left: its MCPs' addresses,
// its sessions on every device, its MCPs at the next sign-in (contract 28, D11).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from './app';
import { createAuth, type SliceAuth } from './auth/auth';
import { openSession } from './auth/open-session';
import { createAccountMcps } from './services/account-mcps';
import { createHostedStore } from './services/hosted-store';
import { openDatabase, type Database } from './db/client';
import { migrateDatabase } from './db/migrate';
import { DATABASE_TEST_TIMEOUTS, createTestDatabase, type TestDatabase } from './db/test-database';
import { createTestAccount, TEST_AUTH_SECRET } from './db/test-account';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

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
let auth: SliceAuth;
let app: Server;
let baseUrl: string;
/** The addresses of the account's two MCPs, one created from each device. */
let addresses: string[];
/** The `Cookie` header of the account's session on its other device, the one that did not delete. */
let phoneCookie: string;
/** The sign-in codes SLICE sent, by address. */
const inbox = new Map<string, string>();

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
  auth = createAuth({
    database,
    secret: TEST_AUTH_SECRET,
    sendCode: async (email, code) => {
      inbox.set(email, code);
    },
  });
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
  phoneCookie = `${phone.name}=${phone.value}`;
  addresses = [await deployMcp(laptopCookie, 'first'), await deployMcp(phoneCookie, 'second')];

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

  it('refuses its session on the other device with 401 (contract 28)', async () => {
    const res = await fetch(`${baseUrl}/api/mcps`, { headers: { cookie: phoneCookie } });

    expect({ status: res.status, body: await res.json() }).toEqual({
      status: 401,
      body: { code: 'UNAUTHORIZED', message: 'Sign in to continue.' },
    });
  });

  it('opens an account without any MCP when the same address signs in again with a code (contract 28)', async () => {
    const browser = request.agent(app);

    await browser.post('/api/auth/email-otp/send-verification-otp').send({ email: EMAIL, type: 'sign-in' });
    await browser.post('/api/auth/sign-in/email-otp').send({ email: EMAIL, otp: inbox.get(EMAIL) });
    const res = await browser.get('/api/mcps');

    expect({ status: res.status, body: res.body }).toEqual({ status: 200, body: { mcps: [] } });
  });
});

describe('POST /api/auth/delete-user refusals', () => {
  it('answers 401 without a session, and deletes nothing', async () => {
    const staying = await openSession(auth, 'staying@example.com');
    const address = await deployMcp(`${staying.name}=${staying.value}`, 'kept');

    const res = await fetch(`${baseUrl}/api/auth/delete-user`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    expect({ status: res.status, mcp: (await listActions(address)).status }).toEqual({ status: 401, mcp: 200 });
  });
});

// Under NODE_ENV=test Better Auth skips its origin check, and `/api/auth/*` sits before
// SLICE's own guard (`requireSameOrigin`): the check is proven on the real entry point,
// run in development from the repository root as `pnpm dev:server` runs it.
describe('POST /api/auth/delete-user from a browser (D16)', () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  /** SLICE's page in development: BETTER_AUTH_URL's default. */
  const SLICE_PAGE = 'http://localhost:5173';
  let scratch: string;
  let server: { baseUrl: string; stop(): Promise<void> };
  let cookie: string;

  /** Asks the server to delete the account of `cookie`, as a page on `origin` would. */
  function deleteFrom(origin: string): Promise<Response> {
    return fetch(`${server.baseUrl}/api/auth/delete-user`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, origin },
      body: '{}',
    });
  }

  /** The address signed in by `cookie`, or `null` once its session is gone. */
  async function signedInEmail(): Promise<string | null> {
    const res = await fetch(`${server.baseUrl}/api/auth/get-session`, { headers: { cookie } });
    return ((await res.json()) as { user: { email: string } } | null)?.user.email ?? null;
  }

  beforeAll(async () => {
    scratch = mkdtempSync(path.join(tmpdir(), 'slice-deletion-'));
    const dataDir = path.join(scratch, 'data');
    // An account signed in on the database the server will open.
    const database = openDatabase({ driver: 'pglite', dataDir: path.join(dataDir, 'pglite') });
    await migrateDatabase(database);
    ({ cookie } = await createTestAccount({ database, email: 'targeted@example.com' }));
    await database.close();
    server = await startServer(ROOT, { SLICE_DATA_DIR: dataDir });
  }, 30_000);

  afterAll(async () => {
    await server?.stop();
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });

  it('refuses a deletion sent from another site with 403, and keeps the account', async () => {
    const res = await deleteFrom('https://evil.example');

    expect({ status: res.status, account: await signedInEmail() }).toEqual({
      status: 403,
      account: 'targeted@example.com',
    });
  });

  it("deletes the account when asked from SLICE's own page", async () => {
    const res = await deleteFrom(SLICE_PAGE);

    expect({ status: res.status, account: await signedInEmail() }).toEqual({ status: 200, account: null });
  });
});

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, r));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((r) => probe.close(() => r()));
  return port;
}

/** The server entry point in `cwd` (tsx binary, no package manager), once it answers its health check. */
async function startServer(cwd: string, env: Record<string, string>) {
  const port = await freePort();
  // Vitest's TEST=true would also tell Better Auth it runs under test, origin check off.
  const { DATABASE_URL: _database, TEST: _test, VITEST: _vitest, ...inherited } = process.env;
  const child = spawn(
    path.join(cwd, 'node_modules/.bin/tsx'),
    ['--tsconfig', path.join(cwd, 'tsconfig.server.json'), path.join(cwd, 'src/server/index.ts')],
    {
      cwd,
      env: { ...inherited, NODE_ENV: 'development', PORT: String(port), BETTER_AUTH_SECRET: TEST_AUTH_SECRET, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const baseUrl = `http://127.0.0.1:${port}`;
  const stop = () =>
    new Promise<void>((r) => {
      if (child.exitCode !== null) return r();
      child.once('exit', () => r());
      child.kill('SIGTERM');
    });
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) throw new Error(`server exited (${child.exitCode}):\n${output}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return { baseUrl, stop };
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  await stop();
  throw new Error(`server never became healthy:\n${output}`);
}
