// WAT-142/143 — "History", at /mcps/<id>/history: the versions of one of my MCPs, never another account's.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { HistoryScreen } from './history';

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

/** Version 2 (one action) is active; version 1 (two actions) is not any more. */
const TWO_VERSIONS = {
  apiName: 'Notion API',
  versions: [
    {
      number: 2,
      createdAt: '2026-10-22T09:00:00.000Z',
      activeSince: '2026-10-22T09:00:00.000Z',
      actionLabels: ['Get a page'],
    },
    { number: 1, createdAt: '2026-10-21T10:15:00.000Z', activeSince: null, actionLabels: ['Search', 'Get a page'] },
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

  it('lists every version, newest first, with its number, creation date and action count (contract 8)', async () => {
    server.histories['notion-id'] = TWO_VERSIONS;

    render(<HistoryScreen mcpId="notion-id" />);

    const versions = await screen.findAllByRole('listitem', { name: /^Version/ });
    expect(
      versions.map((version) => [
        within(version).getByRole('heading').textContent,
        within(version).queryByText(/^Created /)?.textContent,
        within(version).queryByText(/^\d+ actions?$/)?.textContent,
      ])
    ).toEqual([
      ['Version 2', 'Created Oct 22, 2026', '1 action'],
      ['Version 1', 'Created Oct 21, 2026', '2 actions'],
    ]);
  });

  it('marks the active version "Active since" the day it became active, and only that one (contract 9)', async () => {
    server.histories['notion-id'] = TWO_VERSIONS;

    render(<HistoryScreen mcpId="notion-id" />);

    const versions = await screen.findAllByRole('listitem', { name: /^Version/ });
    expect(versions.map((version) => within(version).queryByText(/^Active since/)?.textContent ?? null)).toEqual([
      'Active since Oct 22, 2026',
      null,
    ]);
  });

  it('shows the labels of a version\'s actions once it is unfolded (contract 8)', async () => {
    server.histories['notion-id'] = TWO_VERSIONS;
    const user = userEvent.setup();
    render(<HistoryScreen mcpId="notion-id" />);
    const version1 = within(await screen.findByRole('listitem', { name: 'Version 1' }));
    const folded = version1.queryByText('Search') !== null;

    await user.click(version1.getByRole('button', { name: 'Version 1' }));

    expect({
      folded,
      unfolded: version1.getAllByRole('listitem').map((action) => action.textContent),
    }).toEqual({ folded: false, unfolded: ['Search', 'Get a page'] });
  });

  // The server answers another account's MCP exactly as an unknown one: one case for the page.
  it('says the MCP is not found at the address of an unknown MCP or of another account\'s (contract 19)', async () => {
    window.history.pushState({}, '', '/mcps/someone-elses-id/history');

    render(<App />);

    expect({
      notFound: (await screen.findByRole('heading', { name: 'MCP not found' })) !== null,
      back: screen.getByRole('link', { name: 'Back to My MCPs' }).getAttribute('href'),
    }).toEqual({ notFound: true, back: '/mcps' });
  });
});
