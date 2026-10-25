// WAT-65 — a real PostgreSQL outage, through a TCP relay the test cuts and restores.
// PGlite never goes down on its own, so this runs against the server of
// DATABASE_URL (CI storage step, or a local Docker PostgreSQL).
import { describe, it, expect } from 'vitest';
import { createServer as createTcpServer, connect, type Server as TcpServer, type Socket } from 'node:net';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app';
import { createHostedStore } from '../services/hosted-store';
import { openDatabase } from './client';
import { migrateDatabase } from './migrate';
import { createTestDatabase } from './test-database';
import { createTestAccount } from './test-account';

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

/** A TCP relay to the database that can be cut (every connection dropped) and restored. */
async function startRelay(target: URL) {
  const sockets = new Set<Socket>();
  let server: TcpServer | undefined;
  let port = 0;
  const listen = async () => {
    server = createTcpServer((client) => {
      const upstream = connect(Number(target.port || 5432), target.hostname);
      for (const socket of [client, upstream]) {
        sockets.add(socket);
        socket.on('error', () => {});
        socket.on('close', () => {
          sockets.delete(socket);
          client.destroy();
          upstream.destroy();
        });
      }
      client.pipe(upstream).pipe(client);
    });
    await new Promise<void>((r) => server!.listen(port, '127.0.0.1', r));
    port = (server!.address() as AddressInfo).port;
  };
  await listen();
  return {
    port: () => port,
    cut: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((r) => server!.close(() => r()));
    },
    restore: listen,
  };
}

const withPostgres = process.env.DATABASE_URL ? describe : describe.skip;

withPostgres('a database outage (runs only with DATABASE_URL)', () => {
  it('refuses while the database is cut, and works again once it is back, without a restart', async () => {
    const testDb = await createTestDatabase();
    if (testDb.config.driver !== 'postgres') throw new Error('expected a PostgreSQL test database');
    const target = new URL(testDb.config.url);
    const relay = await startRelay(target);
    const viaRelay = new URL(target);
    viaRelay.hostname = '127.0.0.1';
    viaRelay.port = String(relay.port());
    const database = openDatabase({ driver: 'postgres', url: viaRelay.toString() });
    let app: Server | undefined;
    try {
      await migrateDatabase(database);
      // The account lives behind the relay too: its workspace is the one the connectors point to.
      const signedIn = await createTestAccount({ database });
      const store = createHostedStore(database);
      app = createApp({ nodeEnv: 'test', hostedStore: store, auth: signedIn.auth }).listen(0);
      await new Promise<void>((r) => app!.once('listening', r));
      const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
      const { id } = await store.put(
        { name: 'demo', baseUrl: 'http://127.0.0.1:9', upstreamAuth: { type: 'none' }, endpoints: [] },
        signedIn.workspaceId,
        new Date()
      );
      const statuses = async () => [
        (await create(base, signedIn.cookie)).status,
        (await visit(`${base}/m/${id}`)).status,
        (await fetch(`${base}/api/health`)).status,
      ];

      await relay.cut();
      expect(await statuses()).toEqual([503, 503, 503]);

      await relay.restore();
      await expect.poll(statuses, { timeout: 10_000 }).toEqual([200, 200, 200]);
    } finally {
      await new Promise<void>((r) => (app ? app.close(() => r()) : r()));
      await relay.cut().catch(() => {});
      await database.close().catch(() => {});
      await testDb.dispose();
    }
  }, 30_000);
});

function create(base: string, cookie: string): Promise<Response> {
  return fetch(`${base}/api/host`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      parsedSpec: {},
      rawSpec: SPEC,
      selectedIds: ['GET /things'],
      config: {
        mcpName: 'demo',
        baseUrl: 'http://127.0.0.1:9',
        upstreamAuth: { type: 'none' },
        hosting: 'cloud',
        mode: 'remote',
        includeParamDescriptions: false,
        retryOnServerError: false,
      },
    }),
  });
}

function visit(url: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
}
