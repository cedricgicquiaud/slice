// WAT-159 — "Usage", at /mcps/<id>/usage: opened from My MCPs, reopened by a reload.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

/** The Notion MCP, its two actions never called in the last 30 days. */
const NOTION_UNUSED = {
  apiName: 'Notion API',
  actions: [
    { name: 'search', label: 'Search', available: true, calls: 0, succeeded: 0, averageDurationMs: null, lastCalledAt: null },
    { name: 'get_a_page', label: 'Get a page', available: true, calls: 0, succeeded: 0, averageDurationMs: null, lastCalledAt: null },
  ],
  recentCalls: [],
  cappedDays: [],
};

/**
 * SLICE's API as this page sees it: `GET /api/mcps/:id/usage` answers the usage
 * kept in `usages` under that id, else 404 as for an unknown MCP or another
 * account's; any other call is "who is signed in?" (`session`).
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const state: { session: unknown; usages: Record<string, unknown> } = { session: null, usages: {} };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    const asked = /^\/api\/mcps\/([^/]+)\/usage$/.exec(url);
    if (!asked) return json(state.session);
    const usage = state.usages[asked[1]!];
    return usage ? json(usage) : json({ code: 'NOT_FOUND', message: 'Unknown MCP id.' }, 404);
  }) as typeof fetch;
  return state;
});

afterEach(() => {
  server.usages = {};
  window.history.pushState({}, '', '/');
});

describe('Usage', () => {
  it('opens at /mcps/<id>/usage, as when reloaded there: the MCP named at the top, a way back, no steps (contract 11, D12)', async () => {
    server.usages['notion-id'] = NOTION_UNUSED;
    window.history.pushState({}, '', '/mcps/notion-id/usage');

    render(<App />);

    expect({
      name: (await screen.findByRole('heading', { name: 'Notion API' })) !== null,
      back: screen.getByRole('link', { name: 'Back to My MCPs' }).getAttribute('href'),
      steps: screen.queryByRole('navigation', { name: /steps/i }) !== null,
    }).toEqual({ name: true, back: '/mcps', steps: false });
  });
});
