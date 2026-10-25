// WAT-103/104 — "My MCPs": the account finds its MCPs, copies an address, deletes one.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { McpsScreen } from './mcps';
import { ToastProvider } from '../components/toast';

const NOTION = {
  id: 'notion-id',
  apiName: 'Notion API',
  actionCount: 2,
  createdAt: '2026-10-21T10:15:00.000Z',
  url: 'http://localhost:5173/m/notion-id',
};

/**
 * SLICE's API as this page sees it: `GET /api/mcps` answers the account's MCPs.
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const state: { mcps: unknown[] } = { mcps: [] };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = url === '/api/mcps' ? { mcps: state.mcps } : null;
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return state;
});

beforeEach(() => {
  server.mcps = [];
});

function renderPage() {
  render(
    <ToastProvider>
      <McpsScreen />
    </ToastProvider>
  );
}

describe('My MCPs', () => {
  it("shows each MCP's API name, action count, creation date and address (D9)", async () => {
    server.mcps = [NOTION];

    renderPage();

    const row = within(await screen.findByRole('listitem', { name: 'Notion API' }));
    expect({
      actions: row.queryByText('2 actions') !== null,
      created: row.queryByText('Created Oct 21, 2026') !== null,
      address: row.queryByText('http://localhost:5173/m/notion-id') !== null,
    }).toEqual({ actions: true, created: true, address: true });
  });

  it('counts a single action in the singular', async () => {
    server.mcps = [{ ...NOTION, actionCount: 1 }];

    renderPage();

    const row = within(await screen.findByRole('listitem', { name: 'Notion API' }));
    expect(row.queryByText('1 action')).toBeInTheDocument();
  });
});
