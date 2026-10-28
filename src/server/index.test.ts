import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { execFileSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from './app';
import { openDatabase } from './db/client';
import { migrateDatabase } from './db/migrate';
import { startTestProcess, stopTestProcess } from './test-processes';
import { createHostedStore } from './services/hosted-store';
import { createMcpCalls } from './services/mcp-calls';
import { createTestAccount, TEST_AUTH_SECRET } from './db/test-account';
import { DATABASE_TEST_TIMEOUTS } from './db/test-database';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

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
/** The servers this file starts encrypt with a key of their own: the repository holds none (D11). */
const ENCRYPTION_KEY = randomBytes(32).toString('base64');

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
  const child: ChildProcess = startTestProcess(TSX, ['--tsconfig', path.join(ROOT, 'tsconfig.server.json'), ENTRY], {
    cwd,
    env: {
      ...inherited,
      NODE_ENV: 'development',
      PORT: String(port),
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      SLICE_ENCRYPTION_KEY: ENCRYPTION_KEY,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (chunk) => (output += chunk));
  child.stderr?.on('data', (chunk) => (output += chunk));
  const baseUrl = `http://127.0.0.1:${port}`;
  const stop = () => stopTestProcess(child);
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
  const child = startTestProcess(TSX, ['--tsconfig', path.join(ROOT, 'tsconfig.server.json'), ENTRY], {
    cwd,
    env: { ...inherited, PORT: String(await freePort()), SLICE_ENCRYPTION_KEY: ENCRYPTION_KEY, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout!.on('data', (chunk) => (output += chunk));
  child.stderr!.on('data', (chunk) => (output += chunk));
  const timer = setTimeout(() => void stopTestProcess(child, 'SIGKILL'), 20_000);
  const code = await new Promise<number | null>((r) => child.once('exit', (c) => r(c)));
  clearTimeout(timer);
  await stopTestProcess(child);
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

  // WAT-102 (D2) — no cleanup deletes an MCP. The old one deleted past 72 h + 30 days, so 40 days old.
  it('keeps at startup a connector created 40 days ago, with SLICE_HOSTED_TTL_HOURS=72', async () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    try {
      const database = openDatabase({ driver: 'pglite', dataDir: path.join(scratch, 'pglite') });
      await migrateDatabase(database);
      const { workspaceId } = await createTestAccount({ database });
      const { id } = await createHostedStore(database).put(
        { name: 'old', baseUrl: 'https://api.example.com', upstreamAuth: { type: 'none' }, endpoints: [] },
        workspaceId,
        new Date(Date.now() - 40 * 86_400_000)
      );
      await database.close();

      const server = await startServer(ROOT, { SLICE_DATA_DIR: scratch, SLICE_HOSTED_TTL_HOURS: '72' });
      try {
        const res = await postToolsList(`${server.baseUrl}/m/${id}`);

        expect(res.status).toBe(200);
      } finally {
        await server.stop();
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 30_000);

  it('deletes at startup the calls of more than 30 days, and keeps the others (contract 20, D9)', async () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    try {
      const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
      const database = openDatabase({ driver: 'pglite', dataDir: path.join(scratch, 'pglite') });
      await migrateDatabase(database);
      const { workspaceId } = await createTestAccount({ database });
      const { id } = await createHostedStore(database).put(
        {
          name: 'used',
          baseUrl: 'https://api.example.com',
          upstreamAuth: { type: 'none' },
          endpoints: [{ name: 'list_things', description: 'List things', method: 'GET', path: '/things', params: [] }],
          apiActions: [
            { name: 'list_things', label: 'List things', group: 'Things', deprecated: false, method: 'GET', path: '/things', params: [] },
          ],
        },
        workspaceId,
        daysAgo(40)
      );
      const note = (calledAt: Date) => ({ action: 'list_things', version: 1, calledAt, result: { kind: 'succeeded' as const }, durationMs: 80 });
      const recent = daysAgo(29);
      await createMcpCalls(database).write(id, [note(daysAgo(31)), note(recent)]);
      await database.close();

      const server = await startServer(ROOT, { SLICE_DATA_DIR: scratch });
      await server.stop();

      const reopened = openDatabase({ driver: 'pglite', dataDir: path.join(scratch, 'pglite') });
      try {
        expect((await createMcpCalls(reopened).of(id)).map((kept) => kept.calledAt)).toEqual([recent]);
      } finally {
        await reopened.close();
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 30_000);

  it('keeps the key of an MCP under its SLICE_ENCRYPTION_KEY: readable after a restart with it, unreadable with another (contract 21, D11)', async () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    const readKey = async (server: RunningServer, id: string, cookie: string) =>
      (await (await fetch(`${server.baseUrl}/api/mcps/${id}/api-key`, { headers: { cookie } })).json()) as {
        apiKey: { readable: boolean } | null;
      };
    try {
      const database = openDatabase({ driver: 'pglite', dataDir: path.join(scratch, 'pglite') });
      await migrateDatabase(database);
      const { cookie, workspaceId } = await createTestAccount({ database });
      const { id } = await createHostedStore(database).put(
        { name: 'keyed', baseUrl: 'https://api.example.com', upstreamAuth: { type: 'bearer' }, endpoints: [] },
        workspaceId,
        new Date()
      );
      await database.close();

      const first = await startServer(ROOT, { SLICE_DATA_DIR: scratch });
      let saved: number;
      try {
        saved = (
          await fetch(`${first.baseUrl}/api/mcps/${id}/api-key`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json', cookie },
            body: JSON.stringify({ apiKey: randomBytes(30).toString('base64url') }),
          })
        ).status;
      } finally {
        await first.stop();
      }
      const sameKey = await startServer(ROOT, { SLICE_DATA_DIR: scratch });
      const readWithIt = await readKey(sameKey, id, cookie).finally(() => sameKey.stop());
      const otherKey = await startServer(ROOT, { SLICE_DATA_DIR: scratch, SLICE_ENCRYPTION_KEY: randomBytes(32).toString('base64') });
      const readWithAnother = await readKey(otherKey, id, cookie).finally(() => otherKey.stop());

      expect({ saved, readWithIt: readWithIt.apiKey?.readable, readWithAnother: readWithAnother.apiKey?.readable }).toEqual({
        saved: 200,
        readWithIt: true,
        readWithAnother: false,
      });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 60_000);

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

  it('refuses to start in development without SLICE_ENCRYPTION_KEY, and names it (contract 20, D11)', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    try {
      const { code, output } = await runUntilExit(cwd, { NODE_ENV: 'development', SLICE_ENCRYPTION_KEY: '' });

      expect(code).toBe(1);
      expect(output).toContain('SLICE_ENCRYPTION_KEY is required');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  it('refuses to start in production without SLICE_ENCRYPTION_KEY, and names it (contract 20, D11)', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    try {
      const { code, output } = await runUntilExit(cwd, {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://postgres@127.0.0.1:9/never-reached',
        BETTER_AUTH_SECRET: 'production-secret',
        BETTER_AUTH_URL: 'https://slice.example.com',
        SLICE_ENCRYPTION_KEY: '',
      });

      expect(code).toBe(1);
      expect(output).toContain('SLICE_ENCRYPTION_KEY is required');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  it('refuses to start with a SLICE_ENCRYPTION_KEY of 31 bytes, and names it (contract 20, D11)', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    try {
      const { code, output } = await runUntilExit(cwd, {
        NODE_ENV: 'development',
        SLICE_ENCRYPTION_KEY: randomBytes(31).toString('base64'),
      });

      expect(code).toBe(1);
      expect(output).toContain('SLICE_ENCRYPTION_KEY must be 32 bytes in base64');
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

  // Without it, behind a proxy, every write from SLICE's own page would answer 403 (decided at PR #63's merge).
  it('refuses to start in production without BETTER_AUTH_URL, and says why', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    try {
      const { code, output } = await runUntilExit(cwd, {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://postgres@127.0.0.1:9/never-reached',
        BETTER_AUTH_SECRET: 'production-secret',
        BETTER_AUTH_URL: '',
      });

      expect(code).toBe(1);
      expect(output).toContain('BETTER_AUTH_URL is required in production');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  // WAT-101 — in development the page is Vite's, whose proxy hands the API another address.
  it('takes orders from the Vite page (http://localhost:5173) in development, without BETTER_AUTH_URL', async () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'slice-entry-'));
    try {
      const database = openDatabase({ driver: 'pglite', dataDir: path.join(scratch, 'pglite') });
      await migrateDatabase(database);
      const { cookie } = await createTestAccount({ database });
      await database.close();

      const server = await startServer(ROOT, { SLICE_DATA_DIR: scratch, BETTER_AUTH_URL: '' });
      try {
        const res = await fetch(`${server.baseUrl}/api/host`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie, origin: 'http://localhost:5173' },
          body: '{}',
        });

        expect(((await res.json()) as { code: string }).code).toBe('INVALID_SPEC');
      } finally {
        await server.stop();
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
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

  it('.env.example names SLICE_ENCRYPTION_KEY with the command that generates it (D11)', () => {
    const lines = readFileSync(path.join(ROOT, '.env.example'), 'utf-8').split('\n');
    // The comments above the variable; none when the variable is missing.
    const above = lines.slice(0, Math.max(lines.indexOf('SLICE_ENCRYPTION_KEY='), 0));

    expect(above.some((line) => line.startsWith('#') && line.includes('openssl rand -base64 32'))).toBe(true);
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
