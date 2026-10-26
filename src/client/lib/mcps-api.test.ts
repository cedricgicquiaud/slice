import { describe, it, expect, vi, afterEach } from 'vitest';
import { deleteMcp, getMcpHistory, getMcpSelection, listMcps, restoreMcpVersion, saveMcpSelection } from './mcps-api';

const NOTION = {
  id: 'Q2xhdWRlIGlzIG5vdCBoZXJl',
  apiName: 'Notion API',
  actionCount: 2,
  createdAt: '2026-10-21T10:15:00.000Z',
  url: 'http://localhost:5173/m/Q2xhdWRlIGlzIG5vdCBoZXJl',
};

function serverAnswers(status: number, body: unknown) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  );
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

describe('listMcps', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the account's MCPs read from GET /api/mcps", async () => {
    serverAnswers(200, { mcps: [NOTION] });

    expect(await listMcps()).toEqual([NOTION]);
  });

  it("throws the server's refusal when the list is refused", async () => {
    serverAnswers(503, { code: 'SERVICE_UNAVAILABLE', message: 'SLICE is unavailable for the moment.' });

    await expect(listMcps()).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'SLICE is unavailable for the moment.',
    });
  });
});

describe('deleteMcp', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('asks the server to delete the MCP with DELETE /api/mcps/:id', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as typeof fetch;

    await deleteMcp('notion-id');

    expect(fetchMock.mock.calls).toEqual([['/api/mcps/notion-id', { method: 'DELETE' }]]);
  });

  it("throws the server's refusal when the deletion is refused", async () => {
    serverAnswers(404, { code: 'NOT_FOUND', message: 'Unknown MCP id.' });

    await expect(deleteMcp('someone-elses-id')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('getMcpHistory', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the MCP's versions read from GET /api/mcps/:id/versions", async () => {
    const history = {
      apiName: 'Notion API',
      versions: [
        {
          number: 1,
          createdAt: '2026-10-21T10:15:00.000Z',
          activeSince: '2026-10-21T10:15:00.000Z',
          actionLabels: ['Search', 'Get a page'],
        },
      ],
    };
    const fetchMock = serverAnswers(200, history);

    expect({ history: await getMcpHistory('notion-id'), asked: fetchMock.mock.calls }).toEqual({
      history,
      asked: [['/api/mcps/notion-id/versions']],
    });
  });

  it("throws the server's refusal when the history is refused", async () => {
    serverAnswers(404, { code: 'NOT_FOUND', message: 'Unknown MCP id.' });

    await expect(getMcpHistory('someone-elses-id')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('getMcpSelection', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns every action of the MCP's API and the active version's, read from GET /api/mcps/:id/selection", async () => {
    const selection = {
      apiName: 'Notion API',
      version: 1,
      groups: [
        {
          tag: 'Pages',
          endpoints: [{ id: 'GET /pages/{id}', method: 'GET', path: '/pages/{id}', label: 'Get a page', params: [] }],
        },
      ],
      selectedIds: ['GET /pages/{id}'],
    };
    const fetchMock = serverAnswers(200, selection);

    expect({ selection: await getMcpSelection('notion-id'), asked: fetchMock.mock.calls }).toEqual({
      selection,
      asked: [['/api/mcps/notion-id/selection']],
    });
  });
});

describe('saveMcpSelection', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('posts the selection and the version it starts from to POST /api/mcps/:id/versions, and returns the new number', async () => {
    const fetchMock = serverAnswers(201, { number: 2 });

    const saved = await saveMcpSelection('notion-id', { fromVersion: 1, selectedIds: ['GET /pages/{id}'] });

    expect({ saved, asked: fetchMock.mock.calls }).toEqual({
      saved: 2,
      asked: [
        [
          '/api/mcps/notion-id/versions',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"fromVersion":1,"selectedIds":["GET /pages/{id}"]}',
          },
        ],
      ],
    });
  });
});

describe('restoreMcpVersion', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('asks POST /api/mcps/:id/versions/:number/restore, and returns the date the version is active since', async () => {
    const fetchMock = serverAnswers(200, { number: 1, activeSince: '2026-10-26T15:00:00.000Z' });

    const activeSince = await restoreMcpVersion('notion-id', 1);

    expect({ activeSince, asked: fetchMock.mock.calls }).toEqual({
      activeSince: '2026-10-26T15:00:00.000Z',
      asked: [['/api/mcps/notion-id/versions/1/restore', { method: 'POST' }]],
    });
  });

  it("throws the server's refusal when the restoration is refused", async () => {
    serverAnswers(404, { code: 'NOT_FOUND', message: 'Unknown version of this MCP.' });

    await expect(restoreMcpVersion('notion-id', 7)).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'NOT_FOUND',
      message: 'Unknown version of this MCP.',
    });
  });
});
