// WAT-142/143 — "History", at /mcps/<id>/history: the versions of one of my MCPs, never another account's.
// WAT-148/149 — "Restore" on a version that is not the active one makes it active again.
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
 * another account's, or `refusal` when set; `POST /api/mcps/:id/versions/:number/restore`
 * is kept in `restores` and answers, once `held` resolves when set, the version
 * active since Oct 26, 2026;
 * any other call is "who is signed in?" (`session`).
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const state: {
    session: unknown;
    histories: Record<string, unknown>;
    refusal: { status: number; code: string; message: string } | null;
    restores: string[];
    held: Promise<void> | null;
  } = { session: null, histories: {}, refusal: null, restores: [], held: null };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const restored = /^\/api\/mcps\/[^/]+\/versions\/(\d+)\/restore$/.exec(url);
    if (init?.method === 'POST' && restored) {
      state.restores.push(url);
      await state.held;
      return json({ number: Number(restored[1]), activeSince: '2026-10-26T15:00:00.000Z' });
    }
    const asked = /^\/api\/mcps\/([^/]+)\/versions$/.exec(url);
    if (!asked) return json(state.session);
    if (state.refusal) return json({ code: state.refusal.code, message: state.refusal.message }, state.refusal.status);
    const history = state.histories[asked[1]!];
    return history ? json(history) : json({ code: 'NOT_FOUND', message: 'Unknown MCP id.' }, 404);
  }) as typeof fetch;
  return state;
});

afterEach(() => {
  server.histories = {};
  server.refusal = null;
  server.restores = [];
  server.held = null;
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

  it("shows the server's message when the history is refused for another reason", async () => {
    server.refusal = { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'SLICE is unavailable for the moment.' };

    render(<HistoryScreen mcpId="notion-id" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('SLICE is unavailable for the moment.');
  });
});

describe('Restore', () => {
  it('offers "Restore" on every version but the active one (contract 22)', async () => {
    server.histories['notion-id'] = TWO_VERSIONS;

    render(<HistoryScreen mcpId="notion-id" />);

    const versions = await screen.findAllByRole('listitem', { name: /^Version/ });
    expect(versions.map((version) => within(version).queryByRole('button', { name: 'Restore' }) !== null)).toEqual([
      false,
      true,
    ]);
  });

  it('makes version 1 the active one on "Restore", dated by the server, and says the agent sees it next time (contract 10, D6)', async () => {
    server.histories['notion-id'] = TWO_VERSIONS;
    const user = userEvent.setup();
    render(<HistoryScreen mcpId="notion-id" />);
    const version1 = within(await screen.findByRole('listitem', { name: 'Version 1' }));

    await user.click(version1.getByRole('button', { name: 'Restore' }));

    const versions = screen.getAllByRole('listitem', { name: /^Version/ });
    expect({
      message: (await screen.findByRole('status')).textContent,
      marks: versions.map((version) => within(version).queryByText(/^Active since/)?.textContent ?? null),
      restores: server.restores,
    }).toEqual({
      message: 'Version 1 restored. Your agent sees these actions in its next conversation, with nothing to paste again.',
      marks: [null, 'Active since Oct 26, 2026'],
      restores: ['/api/mcps/notion-id/versions/1/restore'],
    });
  });

  it('greys "Restore" during the call: a double click restores once (contract 25)', async () => {
    server.histories['notion-id'] = TWO_VERSIONS;
    let answer = () => {};
    server.held = new Promise<void>((resolve) => (answer = resolve));
    const user = userEvent.setup();
    render(<HistoryScreen mcpId="notion-id" />);
    const restore = within(await screen.findByRole('listitem', { name: 'Version 1' })).getByRole('button', { name: 'Restore' });

    await user.dblClick(restore);
    const greyedDuringTheCall = restore.hasAttribute('disabled');
    answer();
    await screen.findByRole('status');

    expect({ greyedDuringTheCall, restores: server.restores.length }).toEqual({ greyedDuringTheCall: true, restores: 1 });
  });
});
