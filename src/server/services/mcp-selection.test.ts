// WAT-144/145/146 — the selection of an MCP: read for "Edit actions", changed by "Save" into a new version.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readMcpSelection } from './mcp-selection';
import { createHostedStore, type HostedStore } from './hosted-store';
import type { HostedMcpConfig } from './hosted-mcp-factory';
import { openDatabase, type Database } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { DATABASE_TEST_TIMEOUTS, createTestDatabase, type TestDatabase } from '../db/test-database';
import { createTestAccount } from '../db/test-account';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

const MONDAY = new Date('2026-10-19T08:30:00.000Z');

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
