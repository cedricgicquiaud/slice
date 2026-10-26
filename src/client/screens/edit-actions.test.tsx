// WAT-144/145/146 — "Edit actions", at /mcps/<id>/edit: step 2 again, the active version's actions checked; "Save" makes the next version.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
 * or another account's; `POST /api/mcps/:id/versions` is kept in `saves` and
 * answers version 2 once `held` resolves, when set, or `saveRefusal` when set;
 * any other call is "who is signed in?" (`session`).
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const state: {
    session: unknown;
    selections: Record<string, unknown>;
    saves: Array<{ url: string; change: unknown }>;
    held: Promise<void> | null;
    saveRefusal: { status: number; code: string; message: string } | null;
  } = { session: null, selections: {}, saves: [], held: null, saveRefusal: null };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (init?.method === 'POST' && /^\/api\/mcps\/[^/]+\/versions$/.test(url)) {
      state.saves.push({ url, change: JSON.parse(String(init.body)) });
      await state.held;
      if (state.saveRefusal) {
        const { status, code, message } = state.saveRefusal;
        return json({ code, message }, status);
      }
      return json({ number: 2 }, 201);
    }
    const asked = /^\/api\/mcps\/([^/]+)\/selection$/.exec(url);
    if (!asked) return json(state.session);
    const selection = state.selections[asked[1]!];
    return selection ? json(selection) : json({ code: 'NOT_FOUND', message: 'Unknown MCP id.' }, 404);
  }) as typeof fetch;
  return state;
});

afterEach(() => {
  server.selections = {};
  server.saves = [];
  server.held = null;
  server.saveRefusal = null;
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

  it("shows every action of the API with step 2's groups, labels and counter, the active version's checked (contract 3, D2)", async () => {
    server.selections['notes-id'] = NOTES_SELECTION;
    window.history.pushState({}, '', '/mcps/notes-id/edit');
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Tag: All' }));

    const checked = (label: string) => (screen.getByRole('checkbox', { name: `Select ${label}` }) as HTMLInputElement).checked;
    expect({
      groups: ['Notes', 'Trash'].map((tag) => screen.queryByRole('button', { name: `Tag: ${tag}` }) !== null),
      checked: { list: checked('List notes'), create: checked('Create a note'), emptyTrash: checked('Empty the trash') },
      counter: screen.getByText('Selected').parentElement?.textContent,
    }).toEqual({
      groups: [true, true],
      checked: { list: true, create: true, emptyTrash: false },
      counter: 'Selected2 / 3',
    });
  });

  it("says the MCP is not found for an unknown id or another account's MCP, with no action to check (contract 19, D12)", async () => {
    window.history.pushState({}, '', '/mcps/someone-elses-id/edit');

    render(<App />);

    expect({
      notFound: (await screen.findByRole('heading', { name: 'MCP not found' })) !== null,
      actions: screen.queryAllByRole('checkbox').length,
      save: screen.queryByRole('button', { name: /save/i }),
    }).toEqual({ notFound: true, actions: 0, save: null });
  });

  it('saves a checked action as version 2 and says the agent sees it in its next conversation (contract 5, D6)', async () => {
    server.selections['notes-id'] = NOTES_SELECTION;
    window.history.pushState({}, '', '/mcps/notes-id/edit');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Tag: All' }));

    await user.click(screen.getByRole('checkbox', { name: 'Select Empty the trash' }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect({
      message: (await screen.findByRole('status')).textContent,
      saves: server.saves.map(({ url, change }) => {
        const { fromVersion, selectedIds } = change as { fromVersion: number; selectedIds: string[] };
        return { url, fromVersion, selectedIds: [...selectedIds].sort() };
      }),
    }).toEqual({
      message: 'Saved as version 2. Your agent sees the new actions in its next conversation, with nothing to paste again.',
      saves: [
        { url: '/api/mcps/notes-id/versions', fromVersion: 1, selectedIds: ['DELETE /trash', 'GET /notes', 'POST /notes'] },
      ],
    });
  });

  it("greys Save while the selection is the active version's: as the screen opens, and again once saved (contract 14, D5)", async () => {
    server.selections['notes-id'] = NOTES_SELECTION;
    window.history.pushState({}, '', '/mcps/notes-id/edit');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Tag: All' }));
    const save = () => screen.getByRole('button', { name: /save/i });
    const greyedAsItOpens = save().hasAttribute('disabled');

    await user.click(screen.getByRole('checkbox', { name: 'Select Empty the trash' }));
    await user.click(save());
    await screen.findByRole('status');

    expect({ greyedAsItOpens, greyedOnceSaved: save().hasAttribute('disabled'), saves: server.saves.length }).toEqual({
      greyedAsItOpens: true,
      greyedOnceSaved: true,
      saves: 1,
    });
  });

  it('greys Save when no action is checked (contract 15)', async () => {
    server.selections['notes-id'] = NOTES_SELECTION;
    window.history.pushState({}, '', '/mcps/notes-id/edit');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Tag: All' }));

    await user.click(screen.getByRole('checkbox', { name: 'Select List notes' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Create a note' }));

    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('greys Save during the call: a double click saves one version only (contract 25)', async () => {
    server.selections['notes-id'] = NOTES_SELECTION;
    let answer = () => {};
    server.held = new Promise<void>((resolve) => (answer = resolve));
    window.history.pushState({}, '', '/mcps/notes-id/edit');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Tag: All' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Empty the trash' }));

    await user.dblClick(screen.getByRole('button', { name: /save/i }));
    const greyedDuringTheCall = screen.getByRole('button', { name: /save/i }).hasAttribute('disabled');
    answer();
    await screen.findByRole('status');

    expect({ greyedDuringTheCall, saves: server.saves.length }).toEqual({ greyedDuringTheCall: true, saves: 1 });
  });

  it('shows the refusal of a change made meanwhile in another tab as it is, and claims no version (contract 23, D13)', async () => {
    server.selections['notes-id'] = NOTES_SELECTION;
    server.saveRefusal = {
      status: 409,
      code: 'CONFLICT',
      message: 'This MCP changed in the meantime. Reload to see its current actions.',
    };
    window.history.pushState({}, '', '/mcps/notes-id/edit');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Tag: All' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Empty the trash' }));

    await user.click(screen.getByRole('button', { name: /save/i }));

    expect({
      refusal: (await screen.findByRole('alert')).textContent,
      saved: screen.queryByRole('status'),
    }).toEqual({ refusal: 'This MCP changed in the meantime. Reload to see its current actions.', saved: null });
  });

  it("spaces the saved message from the MCP's name as every page spaces its messages under the name (WAT-153)", async () => {
    server.selections['notes-id'] = NOTES_SELECTION;
    window.history.pushState({}, '', '/mcps/notes-id/edit');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Tag: All' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Empty the trash' }));

    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('status')).toHaveClass('mt-4');
  });

  it("spaces a refusal from the MCP's name as every page spaces its messages under the name (WAT-153)", async () => {
    server.selections['notes-id'] = NOTES_SELECTION;
    server.saveRefusal = {
      status: 409,
      code: 'CONFLICT',
      message: 'This MCP changed in the meantime. Reload to see its current actions.',
    };
    window.history.pushState({}, '', '/mcps/notes-id/edit');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Tag: All' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Empty the trash' }));

    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveClass('mt-4');
  });
});
