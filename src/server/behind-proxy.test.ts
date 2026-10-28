// WAT-188, WAT-109 — SLICE behind Coolify's proxy: the proxy ends HTTPS and forwards
// `http` requests, adding the visitor's address to `X-Forwarded-For`. Its headers are simulated here.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp, type CreateAppOptions } from './app';
import { createHostedStore } from './services/hosted-store';
import { createAccountMcps } from './services/account-mcps';
import { createTestAccount, type TestAccount } from './db/test-account';
import { DATABASE_TEST_TIMEOUTS } from './db/test-database';

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

/** Screen 4's "Deploy", as the proxy forwards it: over `http`. */
function deploy(app: ReturnType<typeof createApp>) {
  return request(app)
    .post('/api/host')
    .set('cookie', account.cookie)
    .set('x-forwarded-proto', 'http')
    .send({
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
    });
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
});
