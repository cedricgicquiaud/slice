import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { createHostedStore, startHostedCleanup } from './hosted-store';
import { saveMcpSelection } from './mcp-selection';
import { restoreMcpVersion } from './mcp-versions';
import type { HttpMethod } from '@shared/types';
import type { ApiAction, HostedMcpConfig } from './hosted-mcp-factory';
import { openDatabase, type Database } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { DATABASE_TEST_TIMEOUTS, createTestDatabase, type TestDatabase } from '../db/test-database';
import { createTestAccount } from '../db/test-account';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

const NOW = new Date('2026-10-24T09:00:00.000Z');

/** Three actions in a deliberate order, with path, query and body params. */
const threeActions: HostedMcpConfig = {
  name: 'crm',
  apiName: 'Acme CRM',
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

/** The whole API behind `threeActions`: its three actions and a deprecated one nobody checked. */
const fourApiActions: ApiAction[] = [
  {
    name: 'list_contacts',
    label: 'List contacts',
    group: 'Contacts',
    description: 'List contacts.\nPaginated.',
    deprecated: false,
    method: 'GET',
    path: '/contacts',
    params: [{ name: 'limit', in: 'query', type: 'integer', required: false }],
  },
  {
    name: 'create_contact',
    label: 'Create a contact',
    group: 'Contacts',
    deprecated: false,
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
    label: 'Delete a contact',
    group: 'Contacts',
    deprecated: false,
    method: 'DELETE',
    path: '/contacts/{id}',
    params: [{ name: 'id', in: 'path', type: 'string', required: true, description: 'Contact id' }],
  },
  {
    name: 'export_contacts',
    label: 'Export contacts',
    group: 'Legacy',
    description: 'Use the list instead.',
    deprecated: true,
    method: 'GET',
    path: '/contacts/export',
    params: [],
  },
];

describe('hosted store in the database', () => {
  let testDb: TestDatabase;
  let database: Database;
  /** The workspace the connectors of these tests belong to. */
  let workspaceId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    database = openDatabase(testDb.config);
    await migrateDatabase(database);
    ({ workspaceId } = await createTestAccount({ database }));
  });

  afterAll(async () => {
    await database?.close();
    await testDb?.dispose();
  });

  it("keeps a connector in the workspace it was created for, with the API's name (D15, D9)", async () => {
    const store = createHostedStore(database);
    const { workspaceId } = await createTestAccount({ database, email: 'owner@example.com' });

    const { id } = await store.put(threeActions, workspaceId, NOW);

    expect(await store.get(id)).toMatchObject({ workspaceId, apiName: 'Acme CRM' });
  });

  it('gives a created connector a 22-character id that reads back the same connector, actions in order', async () => {
    const store = createHostedStore(database);

    const { id } = await store.put(threeActions, workspaceId, NOW);

    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await store.get(id)).toEqual({
      ...threeActions,
      createdAt: '2026-10-24T09:00:00.000Z',
      workspaceId,
      activeVersion: 1,
    });
  });

  it("keeps every action of the connector's API, in order, with what the selection screen shows of it (D1)", async () => {
    const store = createHostedStore(database);

    const { id } = await store.put({ ...threeActions, apiActions: fourApiActions }, workspaceId, NOW);

    expect(await store.apiActions(id)).toEqual(fourApiActions);
  });

  it('keeps an API of 7,400 actions, all selected, past the database limit of 65,535 values per statement', async () => {
    const store = createHostedStore(database);
    const many: ApiAction[] = Array.from({ length: 7_400 }, (_, i) => ({
      name: `action_${i}`,
      label: `Action ${i}`,
      group: 'Bulk',
      deprecated: false,
      method: 'GET',
      path: `/items/${i}`,
      params: [],
    }));
    const endpoints = many.map(({ name, label, method, path, params }) => ({
      name,
      label,
      description: label,
      method,
      path,
      params,
    }));

    const { id } = await store.put({ ...threeActions, endpoints, apiActions: many }, workspaceId, NOW);

    expect(await store.apiActions(id)).toEqual(many);
    expect((await store.get(id))?.endpoints.map(({ name }) => name)).toEqual(many.map(({ name }) => name));
  });

  it('serves the number of the active version: 1 at creation, the new one after a "Save", the restored one after a "Restore" (WAT-154)', async () => {
    const store = createHostedStore(database);
    const { id } = await store.put({ ...threeActions, apiActions: fourApiActions }, workspaceId, NOW);
    const atCreation = (await store.get(id))?.activeVersion;

    await saveMcpSelection(database, workspaceId, id, { fromVersion: 1, selectedIds: ['GET /contacts'] }, NOW);
    const afterSave = (await store.get(id))?.activeVersion;
    await restoreMcpVersion(database, workspaceId, id, 1, NOW);
    const afterRestore = (await store.get(id))?.activeVersion;

    expect({ atCreation, afterSave, afterRestore }).toEqual({ atCreation: 1, afterSave: 2, afterRestore: 1 });
  });

  it('stores a lowercase method in uppercase', async () => {
    const store = createHostedStore(database);
    const lowercase = { ...threeActions.endpoints[0]!, method: 'get' as HttpMethod };

    const { id } = await store.put({ ...threeActions, endpoints: [lowercase] }, workspaceId, NOW);

    expect((await store.get(id))?.endpoints[0]?.method).toBe('GET');
  });

  it('reads nothing back for an unknown id', async () => {
    const store = createHostedStore(database);

    expect(await store.get('nope-unknown-id')).toBeUndefined();
  });

  it('gives two simultaneous creations two distinct ids, both read back', async () => {
    const store = createHostedStore(database);

    const [a, b] = await Promise.all([
      store.put(threeActions, workspaceId, NOW),
      store.put(threeActions, workspaceId, NOW),
    ]);

    expect(a.id).not.toBe(b.id);
    expect((await store.get(a.id))?.name).toBe('crm');
    expect((await store.get(b.id))?.name).toBe('crm');
  });

  it('leaves no connector behind when writing its actions fails', async () => {
    const store = createHostedStore(database);
    const unwritable = { ...threeActions.endpoints[0]!, method: 'TRACE' as HttpMethod };

    await expect(
      store.put({ ...threeActions, name: 'half-written', endpoints: [unwritable] }, workspaceId, NOW)
    ).rejects.toThrow();

    expect(await database.rows(sql`select id from connectors where name = 'half-written'`)).toEqual([]);
  });
});

describe('hosted store cleanup', () => {
  let testDb: TestDatabase;
  let database: Database;
  /** The workspace the connectors of these tests belong to. */
  let workspaceId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    database = openDatabase(testDb.config);
    await migrateDatabase(database);
    ({ workspaceId } = await createTestAccount({ database }));
  });

  afterAll(async () => {
    await database?.close();
    await testDb?.dispose();
  });

  /** Created at NOW (2026-10-24 09:00 UTC) with a 72 h expiry: expired from 2026-10-27 09:00 UTC. */
  const daysAfterExpiry = (days: number) => new Date(Date.UTC(2026, 9, 27 + days, 9));

  it('deletes a connector and its actions 30 days after it expired, without any visit', async () => {
    const store = createHostedStore(database);
    const { id } = await store.put(threeActions, workspaceId, NOW);

    await store.purgeExpired(daysAfterExpiry(31), 72);

    expect(await store.get(id)).toBeUndefined();
    expect(await database.rows(sql`select 1 from connector_actions where connector_id = ${id}`)).toEqual([]);
  });

  it('keeps an expired connector for 29 days after it expired', async () => {
    const store = createHostedStore(database);
    const { id } = await store.put(threeActions, workspaceId, NOW);

    await store.purgeExpired(daysAfterExpiry(29), 72);

    expect((await store.get(id))?.endpoints).toHaveLength(3);
  });

  it('never deletes a connector when expiry is disabled (TTL 0)', async () => {
    const store = createHostedStore(database);
    const { id } = await store.put(threeActions, workspaceId, NOW);

    await store.purgeExpired(daysAfterExpiry(365), 0);

    expect(await store.get(id)).toBeDefined();
  });

  it('cleans up at startup, then every hour', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const store = createHostedStore(database);
    const before = await store.put(threeActions, workspaceId, NOW);
    const cleanup = startHostedCleanup(store, { ttlHours: 72, now: () => daysAfterExpiry(31) });
    try {
      await vi.waitFor(async () => expect(await store.get(before.id)).toBeUndefined());

      const after = await store.put(threeActions, workspaceId, NOW);
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

      await vi.waitFor(async () => expect(await store.get(after.id)).toBeUndefined());
    } finally {
      cleanup.stop();
      vi.useRealTimers();
    }
  });

  it('logs a failed cleanup instead of crashing when the database is unreachable', async () => {
    const downDb = await createTestDatabase();
    const down = openDatabase(downDb.config);
    await migrateDatabase(down);
    const store = createHostedStore(down);
    await down.close();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const cleanup = startHostedCleanup(store, { ttlHours: 72, now: () => NOW });
      cleanup.stop();

      await vi.waitFor(() => expect(logged).toHaveBeenCalledWith('[hosted-store] cleanup failed:', expect.any(String)));
    } finally {
      logged.mockRestore();
      await downDb.dispose();
    }
  });
});

describe('hosted store across a restart', () => {
  it('serves the same connector after the database is reopened', async () => {
    const testDb = await createTestDatabase({ persistent: true });
    try {
      const first = openDatabase(testDb.config);
      await migrateDatabase(first);
      const { workspaceId } = await createTestAccount({ database: first });
      const { id } = await createHostedStore(first).put(threeActions, workspaceId, NOW);
      await first.close();

      const reopened = openDatabase(testDb.config);
      try {
        expect(await createHostedStore(reopened).get(id)).toEqual({
          ...threeActions,
          createdAt: '2026-10-24T09:00:00.000Z',
          workspaceId,
          activeVersion: 1,
        });
      } finally {
        await reopened.close();
      }
    } finally {
      await testDb.dispose();
    }
    // Two databases opened on disk and an account signed in: slow on a loaded machine.
  }, 20_000);
});
