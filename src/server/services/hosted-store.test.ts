import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHostedStore, createFileHostedStore, createDatabaseHostedStore } from './hosted-store';
import type { HttpMethod } from '@shared/types';
import type { HostedMcpConfig } from './hosted-mcp-factory';
import { openDatabase, type Database } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { createTestDatabase, type TestDatabase } from '../db/test-database';

const NOW = new Date('2026-10-24T09:00:00.000Z');

/** Three actions in a deliberate order, with path, query and body params. */
const threeActions: HostedMcpConfig = {
  name: 'crm',
  baseUrl: 'https://api.example.com/v1',
  upstreamAuth: { type: 'apiKey', headerName: 'X-Api-Key' },
  endpoints: [
    {
      name: 'list_contacts',
      description: 'List contacts',
      method: 'GET',
      path: '/contacts',
      params: [{ name: 'limit', in: 'query', type: 'integer', required: false }],
    },
    {
      name: 'create_contact',
      description: 'Create a contact',
      method: 'POST',
      path: '/contacts',
      params: [
        {
          name: 'address',
          in: 'body',
          required: true,
          wireName: 'address',
          schema: { type: 'object', properties: { city: { type: 'string' } }, requiredFields: ['city'] },
        },
      ],
    },
    {
      name: 'delete_contact',
      description: 'Delete a contact',
      method: 'DELETE',
      path: '/contacts/{id}',
      params: [{ name: 'id', in: 'path', type: 'string', required: true, description: 'Contact id' }],
    },
  ],
};

describe('hosted store in the database', () => {
  let testDb: TestDatabase;
  let database: Database;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    database = openDatabase(testDb.config);
    await migrateDatabase(database);
  });

  afterAll(async () => {
    await database?.close();
    await testDb?.dispose();
  });

  it('gives a created connector a 22-character id that reads back the same connector, actions in order', async () => {
    const store = createDatabaseHostedStore(database);

    const { id } = await store.put(threeActions, NOW);

    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await store.get(id)).toEqual({ ...threeActions, createdAt: '2026-10-24T09:00:00.000Z' });
  });

  it('stores a lowercase method in uppercase', async () => {
    const store = createDatabaseHostedStore(database);
    const lowercase = { ...threeActions.endpoints[0]!, method: 'get' as HttpMethod };

    const { id } = await store.put({ ...threeActions, endpoints: [lowercase] }, NOW);

    expect((await store.get(id))?.endpoints[0]?.method).toBe('GET');
  });
});

const config: HostedMcpConfig = {
  name: 'demo',
  baseUrl: 'https://api.example.com',
  upstreamAuth: { type: 'bearer' },
  endpoints: [{ name: 'ping', description: 'Ping', method: 'GET', path: '/ping', params: [] }],
};

describe('hosted store', () => {
  it('put returns an unguessable id (≥22 url-safe chars) and get retrieves the config', () => {
    const store = createHostedStore();
    const id = store.put(config);
    expect(id).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    // toMatchObject: the store also stamps `createdAt` (expiry feature).
    expect(store.get(id)).toMatchObject(config);
  });

  it('returns undefined for an unknown id', () => {
    const store = createHostedStore();
    expect(store.get('does-not-exist')).toBeUndefined();
  });

  it('generates a distinct id per put', () => {
    const store = createHostedStore();
    const a = store.put(config);
    const b = store.put(config);
    expect(a).not.toBe(b);
  });
});

describe('createFileHostedStore', () => {
  const dir = join(tmpdir(), 'slice-store-test');
  const filePath = join(dir, 'hosted.json');

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  });

  it('creates the directory and file on first put', () => {
    const store = createFileHostedStore(filePath);
    store.put(config);
    expect(existsSync(filePath)).toBe(true);
  });

  it('persists across instances (simulates restart)', () => {
    const id = createFileHostedStore(filePath).put(config);
    const reloaded = createFileHostedStore(filePath);
    expect(reloaded.get(id)).toMatchObject(config);
  });

  it('returns undefined for unknown id', () => {
    const store = createFileHostedStore(filePath);
    expect(store.get('unknown')).toBeUndefined();
  });

  it('generates distinct ids per put', () => {
    const store = createFileHostedStore(filePath);
    expect(store.put(config)).not.toBe(store.put(config));
  });

  it('starts fresh when file is corrupted', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, 'NOT JSON', 'utf-8');
    const store = createFileHostedStore(filePath);
    expect(store.get('anything')).toBeUndefined();
  });
});

describe('hosted store — expiry support (createdAt + delete)', () => {
  const dir = join(tmpdir(), 'slice-store-expiry-test');
  const filePath = join(dir, 'hosted.json');

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  });

  it('put stamps createdAt (ISO date) when absent', () => {
    const store = createHostedStore();
    const before = Date.now();
    const id = store.put({ ...config });
    const stored = store.get(id)!;
    expect(stored.createdAt).toBeDefined();
    const t = Date.parse(stored.createdAt!);
    expect(t).toBeGreaterThanOrEqual(before - 1000);
    expect(t).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('put preserves an explicit createdAt (migration / tests)', () => {
    const store = createHostedStore();
    const id = store.put({ ...config, createdAt: '2020-01-01T00:00:00.000Z' });
    expect(store.get(id)!.createdAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('file store: legacy records without createdAt get stamped at load', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, JSON.stringify({ legacyid: config }), 'utf-8');
    const store = createFileHostedStore(filePath);
    expect(store.get('legacyid')!.createdAt).toBeDefined();
  });

  it('delete removes a record (memory and file store)', () => {
    const mem = createHostedStore();
    const memId = mem.put({ ...config });
    mem.delete(memId);
    expect(mem.get(memId)).toBeUndefined();

    const file = createFileHostedStore(filePath);
    const fileId = file.put({ ...config });
    file.delete(fileId);
    expect(file.get(fileId)).toBeUndefined();
    // Deletion is persisted — a reloaded instance must not resurrect it.
    expect(createFileHostedStore(filePath).get(fileId)).toBeUndefined();
  });
});
