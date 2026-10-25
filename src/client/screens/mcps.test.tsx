// WAT-103/104 — "My MCPs": the account finds its MCPs, copies an address, deletes one.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
 * SLICE's API as this page sees it: `GET /api/mcps` answers the account's MCPs,
 * or `refusal` when set.
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const state: { mcps: unknown[]; refusal: { status: number; code: string; message: string } | null } = {
    mcps: [],
    refusal: null,
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== '/api/mcps') return json(null);
    if (state.refusal) return json({ code: state.refusal.code, message: state.refusal.message }, state.refusal.status);
    return json({ mcps: state.mcps });
  }) as typeof fetch;
  return state;
});

beforeEach(() => {
  server.mcps = [];
  server.refusal = null;
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

  it("copies an MCP's address to the clipboard", async () => {
    server.mcps = [NOTION];
    const user = userEvent.setup();
    renderPage();

    const row = within(await screen.findByRole('listitem', { name: 'Notion API' }));
    await user.click(row.getByRole('button', { name: 'Copy address' }));

    expect(await navigator.clipboard.readText()).toBe('http://localhost:5173/m/notion-id');
  });

  it('says so when the account has no MCP yet', async () => {
    server.mcps = [];

    renderPage();

    expect(await screen.findByText('You have no MCP yet.')).toBeInTheDocument();
  });

  it("shows the server's message when the list is refused", async () => {
    server.refusal = { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'SLICE is unavailable for the moment.' };

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('SLICE is unavailable for the moment.');
  });
});
