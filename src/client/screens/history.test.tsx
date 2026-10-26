// WAT-142/143 — "History", at /mcps/<id>/history: the versions of one of my MCPs, never another account's.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

const NOTION_HISTORY = {
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

/**
 * SLICE's API as this page sees it: `GET /api/mcps/:id/versions` answers the
 * history kept in `histories` under that id, else 404 as for an unknown MCP or
 * another account's; any other call is "who is signed in?" (`session`).
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const state: { session: unknown; histories: Record<string, unknown> } = { session: null, histories: {} };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    const asked = /^\/api\/mcps\/([^/]+)\/versions$/.exec(url);
    if (!asked) return json(state.session);
    const history = state.histories[asked[1]!];
    return history ? json(history) : json({ code: 'NOT_FOUND', message: 'Unknown MCP id.' }, 404);
  }) as typeof fetch;
  return state;
});

afterEach(() => {
  server.histories = {};
  window.history.pushState({}, '', '/');
});

describe('History', () => {
  it('opens at /mcps/<id>/history, as when reloaded there: the MCP named at the top, a way back, no steps (contract 4, D15)', async () => {
    server.histories['notion-id'] = NOTION_HISTORY;
    window.history.pushState({}, '', '/mcps/notion-id/history');

    render(<App />);

    expect({
      name: (await screen.findByRole('heading', { name: 'Notion API' })) !== null,
      back: screen.getByRole('link', { name: 'Back to My MCPs' }).getAttribute('href'),
      steps: screen.queryByRole('navigation', { name: /steps/i }) !== null,
    }).toEqual({ name: true, back: '/mcps', steps: false });
  });
});
