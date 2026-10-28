// WAT-176 — "API key", at /mcps/<id>/api-key: I paste my key, "Save", and never see it again.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { ApiKeyScreen } from './api-key';

/** The Notion MCP, reaching its API by an API key in a header. */
const NOTION = {
  id: 'notion-id',
  apiName: 'Notion API',
  actionCount: 2,
  upstreamAuthType: 'apiKey',
  createdAt: '2026-10-21T10:15:00.000Z',
  url: 'http://localhost:5173/m/notion-id',
};

/**
 * SLICE's API as this page sees it: `GET /api/mcps` answers the account's MCPs
 * (`mcps`); `GET /api/mcps/:id/api-key` answers the key kept in `keys` under
 * that id, `null` without any, or 404 for an MCP outside `mcps`, as for an
 * unknown MCP or another account's; `PUT /api/mcps/:id/api-key` keeps the key
 * sent in `saved` and answers it saved on Oct 28, 2026; any other call is
 * "who is signed in?" (`session`).
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const state: {
    session: unknown;
    mcps: { id: string }[];
    keys: Record<string, { savedAt: string; readable: boolean } | null>;
    saved: string[];
  } = { session: null, mcps: [], keys: {}, saved: [] };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === '/api/mcps') return json({ mcps: state.mcps });
    const asked = /^\/api\/mcps\/([^/]+)\/api-key$/.exec(url);
    if (!asked) return json(state.session);
    const id = asked[1]!;
    if (!state.mcps.some((mcp) => mcp.id === id)) return json({ code: 'NOT_FOUND', message: 'Unknown MCP id.' }, 404);
    if (init?.method === 'PUT') {
      state.saved.push((JSON.parse(String(init.body)) as { apiKey: string }).apiKey);
      state.keys[id] = { savedAt: '2026-10-28T09:30:00.000Z', readable: true };
    }
    return json({ apiKey: state.keys[id] ?? null });
  }) as typeof fetch;
  return state;
});

afterEach(() => {
  server.mcps = [];
  server.keys = {};
  server.saved = [];
  window.history.pushState({}, '', '/');
});

describe('API key', () => {
  it("says, under the MCP's name, that the key serves every call, is kept encrypted, and acts for whoever has the address (contract 9, D2, D5)", async () => {
    server.mcps = [NOTION];
    window.history.pushState({}, '', '/mcps/notion-id/api-key');

    render(<App />);

    expect({
      name: (await screen.findByRole('heading', { name: 'Notion API' })) !== null,
      used: screen.queryByText(
        'Your Notion API key is used for every call this MCP makes. SLICE keeps it encrypted and never shows it again.'
      ) !== null,
      address: screen.queryByText("Anyone with this MCP's address acts with your key. Keep the address private.") !== null,
    }).toEqual({ name: true, used: true, address: true });
  });

  it('shows "Saved on <date>" with "Replace" and "Remove" once a pasted key is saved, the date as on My MCPs (contract 1, 9, D3)', async () => {
    server.mcps = [NOTION];
    const user = userEvent.setup();
    render(<ApiKeyScreen mcpId="notion-id" />);

    await user.click(await screen.findByLabelText('API key'));
    await user.paste('secret_ntn_1234');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect({
      saved: (await screen.findByText('Saved on Oct 28, 2026')) !== null,
      replace: screen.queryByRole('button', { name: 'Replace' }) !== null,
      remove: screen.queryByRole('button', { name: 'Remove' }) !== null,
      sent: server.saved,
    }).toEqual({ saved: true, replace: true, remove: true, sent: ['secret_ntn_1234'] });
  });
});
