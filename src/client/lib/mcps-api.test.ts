import { describe, it, expect, vi, afterEach } from 'vitest';
import { deleteMcp, getMcpHistory, listMcps } from './mcps-api';

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
});
