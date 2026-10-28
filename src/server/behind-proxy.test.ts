// WAT-188, WAT-109 — SLICE behind Coolify's proxy: the proxy ends HTTPS and forwards
// `http` requests, adding the visitor's address to `X-Forwarded-For`. Its headers are simulated here.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, type CreateAppOptions } from './app';
import { createHostedStore } from './services/hosted-store';
import { createAccountMcps } from './services/account-mcps';
import { openDatabase } from './db/client';
import { migrateDatabase } from './db/migrate';
import { createTestAccount, TEST_AUTH_SECRET, type TestAccount } from './db/test-account';
import { DATABASE_TEST_TIMEOUTS } from './db/test-database';
import { startTestProcess, stopTestProcess } from './test-processes';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

const SPEC = `openapi: 3.0.3
info: { title: Demo, version: "1.0" }
servers: [{ url: https://api.example.com }]
paths:
  /things:
    get:
      operationId: listThings
      summary: List things
      responses: { '200': { description: ok } }
`;

let account: TestAccount;

beforeAll(async () => {
  account = await createTestAccount();
});

afterAll(async () => {
  await account?.dispose();
});

/** SLICE on the account's database, at the public address `publicUrl`. */
function sliceAt(publicUrl: CreateAppOptions['publicUrl']) {
  return createApp({
    nodeEnv: 'test',
    publicUrl,
    hostedStore: createHostedStore(account.database),
    accountMcps: createAccountMcps(account.database),
    auth: account.auth,
  });
}

/** What screen 4's "Deploy" posts to `/api/host`. */
const DEPLOY = {
  parsedSpec: {},
  rawSpec: SPEC,
  selectedIds: ['GET /things'],
  config: {
    mcpName: 'demo',
    baseUrl: 'https://api.example.com',
    upstreamAuth: { type: 'none' },
    hosting: 'cloud',
    mode: 'remote',
    includeParamDescriptions: false,
    retryOnServerError: false,
  },
};

/** Screen 4's "Deploy", as the proxy forwards it: over `http`. */
function deploy(app: ReturnType<typeof createApp>) {
  return request(app).post('/api/host').set('cookie', account.cookie).set('x-forwarded-proto', 'http').send(DEPLOY);
}

describe("an MCP's address behind the proxy (D5)", () => {
  it("is SLICE's public address followed by /m/<id>, in https though the request came in http (contract 3, 17)", async () => {
    const res = await deploy(sliceAt('https://slice.example.com'));

    expect({ status: res.status, url: res.body.url }).toEqual({
      status: 200,
      url: `https://slice.example.com/m/${res.body.id}`,
    });
  });

  it('is the same in My MCPs, in https though the request came in http (contract 17)', async () => {
    const app = sliceAt('https://slice.example.com');
    const { id } = (await deploy(app)).body;

    const res = await request(app).get('/api/mcps').set('cookie', account.cookie).set('x-forwarded-proto', 'http');

    expect(res.body.mcps.find((mcp: { id: string }) => mcp.id === id)?.url).toBe(`https://slice.example.com/m/${id}`);
  });

  it('ignores a Host header written by the visitor, at creation and in My MCPs', async () => {
    const app = sliceAt('https://slice.example.com');

    const created = await deploy(app).set('host', 'evil.example.com');
    const listed = await request(app).get('/api/mcps').set('cookie', account.cookie).set('host', 'evil.example.com');

    expect({
      created: created.body.url,
      listed: listed.body.mcps.find((mcp: { id: string }) => mcp.id === created.body.id)?.url,
    }).toEqual({
      created: `https://slice.example.com/m/${created.body.id}`,
      listed: `https://slice.example.com/m/${created.body.id}`,
    });
  });

  it('has a single slash before /m when the public address ends with one, at creation and in My MCPs', async () => {
    const app = sliceAt('https://slice.example.com/');

    const created = await deploy(app);
    const listed = await request(app).get('/api/mcps').set('cookie', account.cookie);

    expect({
      created: created.body.url,
      listed: listed.body.mcps.find((mcp: { id: string }) => mcp.id === created.body.id)?.url,
    }).toEqual({
      created: `https://slice.example.com/m/${created.body.id}`,
      listed: `https://slice.example.com/m/${created.body.id}`,
    });
  });
});

// The real entry point, run from the repository root as `pnpm dev:server` runs it (tsx binary, no package manager).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, r));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((r) => probe.close(() => r()));
  return port;
}

describe('the server started with BETTER_AUTH_URL (D5, D16)', () => {
  it('gives a created MCP an address at BETTER_AUTH_URL, not at the address the request reached', async () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'slice-public-url-'));
    const database = openDatabase({ driver: 'pglite', dataDir: path.join(scratch, 'pglite') });
    await migrateDatabase(database);
    const { cookie } = await createTestAccount({ database });
    await database.close();
    const port = await freePort();
    const { DATABASE_URL: _ignored, ...inherited } = process.env;
    const server = startTestProcess(
      path.join(ROOT, 'node_modules/.bin/tsx'),
      ['--tsconfig', path.join(ROOT, 'tsconfig.server.json'), path.join(ROOT, 'src/server/index.ts')],
      {
        cwd: ROOT,
        env: {
          ...inherited,
          NODE_ENV: 'development',
          PORT: String(port),
          SLICE_DATA_DIR: scratch,
          BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
          BETTER_AUTH_URL: 'http://localhost:5173',
          SLICE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
        },
        stdio: 'ignore',
      }
    );
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (await fetch(`${baseUrl}/api/health`).then((res) => res.ok, () => false)) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      const res = await fetch(`${baseUrl}/api/host`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(DEPLOY),
      });
      const body = (await res.json()) as { id: string; url: string };

      expect({ status: res.status, url: body.url }).toEqual({ status: 200, url: `http://localhost:5173/m/${body.id}` });
    } finally {
      await stopTestProcess(server);
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 30_000);
});
