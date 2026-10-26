// WAT-159 — "Usage", at /mcps/<id>/usage: opened from My MCPs, reopened by a reload.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { UsageScreen } from './usage';

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
 * account's, or `refusal` when set; any other call is "who is signed in?" (`session`).
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const state: {
    session: unknown;
    usages: Record<string, unknown>;
    refusal: { status: number; code: string; message: string } | null;
  } = { session: null, usages: {}, refusal: null };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    const asked = /^\/api\/mcps\/([^/]+)\/usage$/.exec(url);
    if (!asked) return json(state.session);
    if (state.refusal) return json({ code: state.refusal.code, message: state.refusal.message }, state.refusal.status);
    const usage = state.usages[asked[1]!];
    return usage ? json(usage) : json({ code: 'NOT_FOUND', message: 'Unknown MCP id.' }, 404);
  }) as typeof fetch;
  return state;
});

afterEach(() => {
  server.usages = {};
  server.refusal = null;
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

  // The server answers another account's MCP exactly as an unknown one: one case for the page.
  it("says the MCP is not found at the address of an unknown MCP or of another account's, spaced mt-4 under the title (contract 21)", async () => {
    window.history.pushState({}, '', '/mcps/someone-elses-id/usage');

    render(<App />);

    const notFound = await screen.findByRole('heading', { name: 'MCP not found' });
    const message = screen.getByText('There is no MCP at this address in your account.');
    expect({
      notFound: notFound !== null,
      spaced: message.classList.contains('mt-4'),
      back: screen.getByRole('link', { name: 'Back to My MCPs' }).getAttribute('href'),
    }).toEqual({ notFound: true, spaced: true, back: '/mcps' });
  });

  it("shows the server's message when the usage is refused for another reason", async () => {
    server.refusal = { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'SLICE is unavailable for the moment.' };

    render(<UsageScreen mcpId="notion-id" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('SLICE is unavailable for the moment.');
  });
});
