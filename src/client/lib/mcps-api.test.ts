import { describe, it, expect, vi, afterEach } from 'vitest';
import { listMcps } from './mcps-api';

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
});
