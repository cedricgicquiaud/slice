// WAT-144/145/146 — "Edit actions", at /mcps/<id>/edit: step 2 again, the active version's actions checked; "Save" makes the next version.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

/** The Notes API: three actions in two groups; version 1 holds the reading and the creation of notes. */
const NOTES_SELECTION = {
  apiName: 'Notes API',
  version: 1,
  groups: [
    {
      tag: 'Notes',
      endpoints: [
        { id: 'GET /notes', method: 'GET', path: '/notes', label: 'List notes', params: [] },
        { id: 'POST /notes', method: 'POST', path: '/notes', label: 'Create a note', params: [] },
      ],
    },
    {
      tag: 'Trash',
      endpoints: [{ id: 'DELETE /trash', method: 'DELETE', path: '/trash', label: 'Empty the trash', params: [] }],
    },
  ],
  selectedIds: ['GET /notes', 'POST /notes'],
};

/**
 * SLICE's API as this page sees it: `GET /api/mcps/:id/selection` answers the
 * selection kept in `selections` under that id, else 404 as for an unknown MCP
 * or another account's; any other call is "who is signed in?" (`session`).
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const state: { session: unknown; selections: Record<string, unknown> } = { session: null, selections: {} };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    const asked = /^\/api\/mcps\/([^/]+)\/selection$/.exec(url);
    if (!asked) return json(state.session);
    const selection = state.selections[asked[1]!];
    return selection ? json(selection) : json({ code: 'NOT_FOUND', message: 'Unknown MCP id.' }, 404);
  }) as typeof fetch;
  return state;
});

afterEach(() => {
  server.selections = {};
  window.history.pushState({}, '', '/');
});

describe('Edit actions', () => {
  it('opens at /mcps/<id>/edit, as when reloaded there: the MCP named at the top, a way back, no steps (contract 3, 4, D15)', async () => {
    server.selections['notes-id'] = NOTES_SELECTION;
    window.history.pushState({}, '', '/mcps/notes-id/edit');

    render(<App />);

    expect({
      name: (await screen.findByRole('heading', { name: 'Notes API' })) !== null,
      back: screen.getByRole('link', { name: 'Back to My MCPs' }).getAttribute('href'),
      steps: screen.queryByRole('navigation', { name: /steps/i }) !== null,
    }).toEqual({ name: true, back: '/mcps', steps: false });
  });
});
