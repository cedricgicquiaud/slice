import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createHostedStore } from './hosted-store';
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
    const store = createHostedStore(database);

    const { id } = await store.put(threeActions, NOW);

    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await store.get(id)).toEqual({ ...threeActions, createdAt: '2026-10-24T09:00:00.000Z' });
  });

  it('stores a lowercase method in uppercase', async () => {
    const store = createHostedStore(database);
    const lowercase = { ...threeActions.endpoints[0]!, method: 'get' as HttpMethod };

    const { id } = await store.put({ ...threeActions, endpoints: [lowercase] }, NOW);

    expect((await store.get(id))?.endpoints[0]?.method).toBe('GET');
  });

  it('reads nothing back for an unknown id', async () => {
    const store = createHostedStore(database);

    expect(await store.get('nope-unknown-id')).toBeUndefined();
  });

  it('gives two simultaneous creations two distinct ids, both read back', async () => {
    const store = createHostedStore(database);

    const [a, b] = await Promise.all([store.put(threeActions, NOW), store.put(threeActions, NOW)]);

    expect(a.id).not.toBe(b.id);
    expect((await store.get(a.id))?.name).toBe('crm');
    expect((await store.get(b.id))?.name).toBe('crm');
  });

  it('leaves no connector behind when writing its actions fails', async () => {
    const store = createHostedStore(database);
    const unwritable = { ...threeActions.endpoints[0]!, method: 'TRACE' as HttpMethod };

    await expect(
      store.put({ ...threeActions, name: 'half-written', endpoints: [unwritable] }, NOW)
    ).rejects.toThrow();

    expect(await database.rows(sql`select id from connectors where name = 'half-written'`)).toEqual([]);
  });
});

describe('hosted store cleanup', () => {
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

  /** Created at NOW (2026-10-24 09:00 UTC) with a 72 h expiry: expired from 2026-10-27 09:00 UTC. */
  const daysAfterExpiry = (days: number) => new Date(Date.UTC(2026, 9, 27 + days, 9));

  it('deletes a connector and its actions 30 days after it expired, without any visit', async () => {
    const store = createHostedStore(database);
    const { id } = await store.put(threeActions, NOW);

    await store.purgeExpired(daysAfterExpiry(31), 72);

    expect(await store.get(id)).toBeUndefined();
    expect(await database.rows(sql`select 1 from connector_actions where connector_id = ${id}`)).toEqual([]);
  });

  it('keeps an expired connector for 29 days after it expired', async () => {
    const store = createHostedStore(database);
    const { id } = await store.put(threeActions, NOW);

    await store.purgeExpired(daysAfterExpiry(29), 72);

    expect((await store.get(id))?.endpoints).toHaveLength(3);
  });

  it('never deletes a connector when expiry is disabled (TTL 0)', async () => {
    const store = createHostedStore(database);
    const { id } = await store.put(threeActions, NOW);

    await store.purgeExpired(daysAfterExpiry(365), 0);

    expect(await store.get(id)).toBeDefined();
  });
});

describe('hosted store across a restart', () => {
  it('serves the same connector after the database is reopened', async () => {
    const testDb = await createTestDatabase({ persistent: true });
    try {
      const first = openDatabase(testDb.config);
      await migrateDatabase(first);
      const { id } = await createHostedStore(first).put(threeActions, NOW);
      await first.close();

      const reopened = openDatabase(testDb.config);
      try {
        expect(await createHostedStore(reopened).get(id)).toEqual({
          ...threeActions,
          createdAt: '2026-10-24T09:00:00.000Z',
        });
      } finally {
        await reopened.close();
      }
    } finally {
      await testDb.dispose();
    }
  });
});
