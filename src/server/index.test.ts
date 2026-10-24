import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from './app';
import { openDatabase } from './db/client';
import { migrateDatabase } from './db/migrate';
import { createHostedStore } from './services/hosted-store';
import { createTestAccount, TEST_AUTH_SECRET } from './db/test-account';

describe('Express app', () => {
  it('GET /api/health responds 200 with status ok', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: 'ok' });
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('GET /api/health echoes the current NODE_ENV', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');

    expect(res.body.env).toBeDefined();
    expect(typeof res.body.env).toBe('string');
  });
});

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

// The real entry point, run as `pnpm dev:server` runs it (tsx binary, no package manager).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TSX = path.join(ROOT, 'node_modules/.bin/tsx');
const ENTRY = path.join(ROOT, 'src/server/index.ts');

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, r));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((r) => probe.close(() => r()));
  return port;
}

interface RunningServer {
  baseUrl: string;
  /** What the server printed in its terminal so far. */
  output(): string;
  stop(): Promise<void>;
}

/** Start the server in `cwd` and wait until it answers its health check. */
async function startServer(cwd: string, env: Record<string, string>): Promise<RunningServer> {
  const port = await freePort();
  const { DATABASE_URL: _ignored, ...inherited } = process.env;
  const child: ChildProcess = spawn(TSX, ['--tsconfig', path.join(ROOT, 'tsconfig.server.json'), ENTRY], {
    cwd,
    env: { ...inherited, NODE_ENV: 'development', PORT: String(port), BETTER_AUTH_SECRET: TEST_AUTH_SECRET, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (chunk) => (output += chunk));
  child.stderr?.on('data', (chunk) => (output += chunk));
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
      if ((await fetch(`${baseUrl}/api/health`)).ok) return { baseUrl, output: () => output, stop };
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  await stop();
  throw new Error(`server never became healthy:\n${output}`);
}

/** Run the server in `cwd` until it exits on its own; return its exit code and output. */
async function runUntilExit(cwd: string, env: Record<string, string>): Promise<{ code: number | null; output: string }> {
  const { DATABASE_URL: _ignored, ...inherited } = process.env;
  const child = spawn(TSX, ['--tsconfig', path.join(ROOT, 'tsconfig.server.json'), ENTRY], {
    cwd,
    env: { ...inherited, PORT: String(await freePort()), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
  const code = await new Promise<number | null>((r) => child.once('exit', (c) => r(c)));
  clearTimeout(timer);
  return { code, output };
}

function postToolsList(url: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
}

/** Where the server sends a sign-in with `provider`: the provider's address and the application's ID. */
async function signInStart(baseUrl: string, provider: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider, callbackURL: '/' }),
  });
  const { url } = (await res.json()) as { url?: string };
  if (!url) return 'no sign-in';
  const authorize = new URL(url);
  return `${authorize.origin}${authorize.pathname} ${authorize.searchParams.get('client_id')}`;
}

describe('server entry point', () => {
  it('starts without DATABASE_URL and never reads the old hosted.json file', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    const legacyFile = path.join(cwd, 'data', 'hosted.json');
    mkdirSync(path.dirname(legacyFile), { recursive: true });
    const legacy = JSON.stringify({
      LegacyConnectorId00001: {
        name: 'legacy',
        baseUrl: 'https://api.example.com',
        upstreamAuth: { type: 'none' },
        endpoints: [],
        createdAt: '2026-10-24T09:00:00.000Z',
      },
    });
    writeFileSync(legacyFile, legacy);
    const server = await startServer(cwd, { SLICE_HOSTED_TTL_HOURS: '0' });
    try {
      const res = await postToolsList(`${server.baseUrl}/m/LegacyConnectorId00001`);

      expect(res.status).toBe(404);
      expect(readFileSync(legacyFile, 'utf-8')).toBe(legacy);
    } finally {
      await server.stop();
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  it('creates its tables on a first start in an empty folder, and keeps connectors across a restart', async () => {
    // Run from the repository root like `pnpm dev` (the parse child resolves tsx from there).
    const scratch = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    const env = { SLICE_HOSTED_TTL_HOURS: '0', SLICE_DATA_DIR: path.join(scratch, 'data') };
    try {
      // An account signed in on the database the server will open.
      const database = openDatabase({ driver: 'pglite', dataDir: path.join(scratch, 'data', 'pglite') });
      await migrateDatabase(database);
      const { cookie } = await createTestAccount({ database });
      await database.close();

      const first = await startServer(ROOT, env);
      let url: string;
      try {
        const res = await fetch(`${first.baseUrl}/api/host`, {
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
        expect(res.status).toBe(200);
        url = ((await res.json()) as { url: string }).url;
      } finally {
        await first.stop();
      }

      const restarted = await startServer(ROOT, env);
      try {
        const res = await postToolsList(`${restarted.baseUrl}${new URL(url).pathname}`);

        expect(res.status).toBe(200);
        expect(await res.text()).toContain('list_things');
      } finally {
        await restarted.stop();
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 60_000);

  it('deletes at startup a connector expired for more than 30 days', async () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    try {
      const database = openDatabase({ driver: 'pglite', dataDir: path.join(scratch, 'pglite') });
      await migrateDatabase(database);
      const { workspaceId } = await createTestAccount({ database });
      const { id } = await createHostedStore(database).put(
        { name: 'old', baseUrl: 'https://api.example.com', upstreamAuth: { type: 'none' }, endpoints: [] },
        workspaceId,
        new Date('2020-01-01T00:00:00.000Z')
      );
      await database.close();

      const server = await startServer(ROOT, { SLICE_DATA_DIR: scratch, SLICE_HOSTED_TTL_HOURS: '72' });
      try {
        await expect.poll(async () => (await postToolsList(`${server.baseUrl}/m/${id}`)).status).toBe(404);
      } finally {
        await server.stop();
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 30_000);

  it('refuses to start when its migrations fail, and says why', async () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    try {
      // A database where a type of the schema already exists with another shape.
      const conflicting = new PGlite(path.join(scratch, 'pglite'));
      await conflicting.exec(`CREATE TYPE upstream_auth_type AS ENUM ('legacy')`);
      await conflicting.close();

      const { code, output } = await runUntilExit(ROOT, { NODE_ENV: 'development', SLICE_DATA_DIR: scratch });

      expect(code).toBe(1);
      expect(output).toMatch(/Database migrations failed: .*already exists/);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 30_000);

  it('refuses to start in production without DATABASE_URL, and says why', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    try {
      const { code, output } = await runUntilExit(cwd, { NODE_ENV: 'production' });

      expect(code).toBe(1);
      expect(output).toContain('DATABASE_URL is required in production');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  it('starts the Google and Microsoft sign-ins with the applications declared in its environment', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    const server = await startServer(cwd, {
      GOOGLE_CLIENT_ID: 'declared-google-app',
      GOOGLE_CLIENT_SECRET: 'google-secret',
      MICROSOFT_CLIENT_ID: 'declared-microsoft-app',
      MICROSOFT_CLIENT_SECRET: 'microsoft-secret',
    });
    try {
      expect([await signInStart(server.baseUrl, 'google'), await signInStart(server.baseUrl, 'microsoft')]).toEqual([
        'https://accounts.google.com/o/oauth2/v2/auth declared-google-app',
        'https://login.microsoftonline.com/common/oauth2/v2.0/authorize declared-microsoft-app',
      ]);
    } finally {
      await server.stop();
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  it('prints the sign-in code in its terminal when it has no Resend key', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    const server = await startServer(cwd, { RESEND_API_KEY: '' });
    try {
      await fetch(`${server.baseUrl}/api/auth/email-otp/send-verification-otp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'ada@example.com', type: 'sign-in' }),
      });

      expect(server.output()).toMatch(/ada@example\.com: \d{6}/);
    } finally {
      await server.stop();
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  it('refuses to start in production without BETTER_AUTH_SECRET, and says why', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    try {
      const { code, output } = await runUntilExit(cwd, {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://postgres@127.0.0.1:9/never-reached',
        BETTER_AUTH_SECRET: '',
      });

      expect(code).toBe(1);
      expect(output).toContain('BETTER_AUTH_SECRET is required in production');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('environment file', () => {
  const variables = () =>
    readFileSync(path.join(ROOT, '.env.example'), 'utf-8')
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'));

  it('.env.example names the variables of accounts and sign-in applications', () => {
    const names = variables().map((line) => line.split('=')[0]);

    expect(names).toEqual(
      expect.arrayContaining([
        'BETTER_AUTH_SECRET',
        'BETTER_AUTH_URL',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'MICROSOFT_CLIENT_ID',
        'MICROSOFT_CLIENT_SECRET',
      ])
    );
  });

  it('.env.example names the variables of the code by email', () => {
    const names = variables().map((line) => line.split('=')[0]);

    expect(names).toEqual(expect.arrayContaining(['RESEND_API_KEY', 'RESEND_FROM']));
  });

  it('.env.example carries no value', () => {
    expect(variables().filter((line) => !/^[A-Z][A-Z0-9_]*=$/.test(line))).toEqual([]);
  });

  it('pnpm dev:server reads the .env of the repository (D5); tests and pnpm start never do', () => {
    const { scripts } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

    expect(scripts['dev:server']).toContain('--env-file-if-exists=.env');
  });

  it('.env, where the values go, is never committed', () => {
    // `git check-ignore` exits non-zero, so throws, when the path is not ignored.
    expect(() => execFileSync('git', ['check-ignore', '--quiet', '.env'], { cwd: ROOT })).not.toThrow();
  });
});
