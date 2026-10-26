// WAT-144/145/146 — the selection of an MCP: read for "Edit actions", changed by "Save" into a new version.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readMcpSelection, saveMcpSelection } from './mcp-selection';
import { createHostedStore, type HostedStore } from './hosted-store';
import type { HostedMcpConfig } from './hosted-mcp-factory';
import { openDatabase, type Database } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { DATABASE_TEST_TIMEOUTS, createTestDatabase, type TestDatabase } from '../db/test-database';
import { createTestAccount } from '../db/test-account';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

const MONDAY = new Date('2026-10-19T08:30:00.000Z');
const TUESDAY = new Date('2026-10-20T14:00:00.000Z');

const LIST_NOTES = { name: 'list_notes', label: 'List notes', method: 'GET', path: '/notes', params: [] } as const;
const CREATE_NOTE = {
  name: 'create_note',
  label: 'Create a note',
  method: 'POST',
  path: '/notes',
  params: [{ name: 'title', in: 'body', type: 'string', required: true, wireName: 'title' }],
} as const;
const EMPTY_TRASH = { name: 'empty_trash', label: 'Empty the trash', method: 'DELETE', path: '/trash', params: [] } as const;

/** An API of three actions in two groups; version 1 holds the first two. */
const NOTES: HostedMcpConfig = {
  name: 'notes',
  apiName: 'Notes API',
  baseUrl: 'https://notes.example.com/v1',
  upstreamAuth: { type: 'bearer' },
  endpoints: [
    { ...LIST_NOTES, description: 'List notes', params: [] },
    { ...CREATE_NOTE, description: 'Create a note', params: [...CREATE_NOTE.params] },
  ],
  apiActions: [
    { ...LIST_NOTES, group: 'Notes', description: 'List notes', deprecated: false, params: [] },
    { ...CREATE_NOTE, group: 'Notes', description: 'Create a note', deprecated: false, params: [...CREATE_NOTE.params] },
    { ...EMPTY_TRASH, group: 'Trash', deprecated: true, params: [] },
  ],
};

let testDb: TestDatabase;
let database: Database;
let store: HostedStore;

beforeAll(async () => {
  testDb = await createTestDatabase();
  database = openDatabase(testDb.config);
  await migrateDatabase(database);
  store = createHostedStore(database);
});

afterAll(async () => {
  await database?.close();
  await testDb?.dispose();
});

describe('the selection of an MCP, for "Edit actions"', () => {
  it("shows every action of its API by group, the active version's checked (D2)", async () => {
    const { workspaceId } = await createTestAccount({ database, email: 'edit@example.com' });
    const { id } = await store.put(NOTES, workspaceId, MONDAY);

    expect(await readMcpSelection(database, workspaceId, id)).toEqual({
      apiName: 'Notes API',
      version: 1,
      groups: [
        {
          tag: 'Notes',
          endpoints: [
            {
              id: 'GET /notes',
              method: 'GET',
              path: '/notes',
              label: 'List notes',
              description: 'List notes',
              deprecated: false,
              params: [],
            },
            {
              id: 'POST /notes',
              method: 'POST',
              path: '/notes',
              label: 'Create a note',
              description: 'Create a note',
              deprecated: false,
              params: [{ name: 'title', in: 'body', type: 'string', required: true, wireName: 'title' }],
            },
          ],
        },
        {
          tag: 'Trash',
          endpoints: [
            { id: 'DELETE /trash', method: 'DELETE', path: '/trash', label: 'Empty the trash', deprecated: true, params: [] },
          ],
        },
      ],
      selectedIds: ['GET /notes', 'POST /notes'],
    });
  });
});

describe('"Save"', () => {
  it("makes the new selection version 2, the active one: the MCP's address serves its actions (contract 5, 6)", async () => {
    const { workspaceId } = await createTestAccount({ database, email: 'save@example.com' });
    const { id } = await store.put(NOTES, workspaceId, MONDAY);

    const outcome = await saveMcpSelection(
      database,
      workspaceId,
      id,
      { fromVersion: 1, selectedIds: ['GET /notes', 'POST /notes', 'DELETE /trash'] },
      TUESDAY
    );

    expect({ outcome, served: (await store.get(id))?.endpoints }).toEqual({
      outcome: { version: 2 },
      served: [
        { name: 'list_notes', description: 'List notes', method: 'GET', path: '/notes', params: [] },
        { name: 'create_note', description: 'Create a note', method: 'POST', path: '/notes', params: CREATE_NOTE.params },
        { name: 'empty_trash', description: 'Empty the trash', method: 'DELETE', path: '/trash', params: [] },
      ],
    });
  });

  it('makes a selection identical to an older version a new version, numbered after the last one (contract 7, D5, D9)', async () => {
    const { workspaceId } = await createTestAccount({ database, email: 'back-to-v1@example.com' });
    const { id } = await store.put(NOTES, workspaceId, MONDAY);
    await saveMcpSelection(database, workspaceId, id, { fromVersion: 1, selectedIds: ['GET /notes'] }, TUESDAY);

    const outcome = await saveMcpSelection(
      database,
      workspaceId,
      id,
      { fromVersion: 2, selectedIds: ['GET /notes', 'POST /notes'] },
      TUESDAY
    );

    expect({ outcome, served: (await store.get(id))?.endpoints.map((action) => action.name) }).toEqual({
      outcome: { version: 3 },
      served: ['list_notes', 'create_note'],
    });
  });

  it('refuses a change started from a version that is no longer the active one, and saves nothing (contract 23, D13)', async () => {
    const { workspaceId } = await createTestAccount({ database, email: 'two-tabs@example.com' });
    const { id } = await store.put(NOTES, workspaceId, MONDAY);
    await saveMcpSelection(database, workspaceId, id, { fromVersion: 1, selectedIds: ['GET /notes'] }, TUESDAY);

    const outcome = await saveMcpSelection(
      database,
      workspaceId,
      id,
      { fromVersion: 1, selectedIds: ['GET /notes', 'DELETE /trash'] },
      TUESDAY
    );

    expect({ outcome, now: (await readMcpSelection(database, workspaceId, id))?.version }).toEqual({
      outcome: { refused: 'changed-meanwhile' },
      now: 2,
    });
  });
});
