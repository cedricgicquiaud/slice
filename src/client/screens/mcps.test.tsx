// WAT-103/104 — "My MCPs": the account finds its MCPs, copies an address, deletes one.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { McpsScreen } from './mcps';
import { AuthGate } from '../components/auth-gate';
import { ToastProvider } from '../components/toast';
import { refreshSession } from '../lib/auth-client';

const NOTION = {
  id: 'notion-id',
  apiName: 'Notion API',
  actionCount: 2,
  createdAt: '2026-10-21T10:15:00.000Z',
  url: 'http://localhost:5173/m/notion-id',
};

const LIVE_SESSION = {
  session: { id: 's1', userId: 'u1', token: 't', expiresAt: '2026-11-01T00:00:00.000Z' },
  user: { id: 'u1', email: 'ada@example.com', name: '', emailVerified: true },
};

/**
 * SLICE's API as this page sees it: `GET /api/mcps` answers the account's MCPs,
 * or `refusal` when set (a 401 means the session is gone); any other call is
 * "who is signed in?" (`session`).
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const state: {
    session: unknown;
    mcps: unknown[];
    refusal: { status: number; code: string; message: string } | null;
  } = { session: null, mcps: [], refusal: null };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== '/api/mcps') return json(state.session);
    if (state.refusal?.status === 401) state.session = null;
    if (state.refusal) return json({ code: state.refusal.code, message: state.refusal.message }, state.refusal.status);
    return json({ mcps: state.mcps });
  }) as typeof fetch;
  return state;
});

/** The server now answers `session`; like a sign-in or out, the client is told to ask again. */
function serverSession(session: unknown) {
  server.session = session;
  refreshSession();
}

beforeEach(() => {
  server.mcps = [];
  server.refusal = null;
});

afterEach(() => {
  window.history.pushState({}, '', '/');
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

  it('opens at /mcps, as when the page is reloaded there, with the list (contract 9)', async () => {
    window.history.pushState({}, '', '/mcps');
    server.mcps = [NOTION];

    render(<App />);

    expect(await screen.findByRole('listitem', { name: 'Notion API' })).toBeInTheDocument();
  });

  // Contract 13: the session ran out while the page was on screen.
  it('shows the sign-in screen when the list is refused for want of a session', async () => {
    serverSession(LIVE_SESSION);
    server.refusal = { status: 401, code: 'UNAUTHORIZED', message: 'Sign in to continue.' };

    render(
      <AuthGate>
        <McpsScreen />
      </AuthGate>
    );
    await screen.findByRole('heading', { name: 'My MCPs' });

    expect(await screen.findByRole('heading', { name: 'Sign in to SLICE' })).toBeInTheDocument();
  });
});
