// WAT-176 — "API key", at /mcps/<id>/api-key: I paste my key, "Save", and never see it again.
// WAT-177 — I replace or remove my key; a key SLICE can no longer read asks to be replaced.
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
 * sent in `saved` and answers, once `held` resolves when set, the key saved on
 * Oct 28, 2026; any other call is
 * "who is signed in?" (`session`).
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const state: {
    session: unknown;
    mcps: { id: string }[];
    keys: Record<string, { savedAt: string; readable: boolean } | null>;
    saved: string[];
    held: Promise<void> | null;
  } = { session: null, mcps: [], keys: {}, saved: [], held: null };
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
      await state.held;
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
  server.held = null;
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

  it('reopens at /mcps/<id>/api-key in the state it was left, as when reloaded there: the key saved, no field, no steps (contract 7, D1)', async () => {
    server.mcps = [NOTION];
    server.keys['notion-id'] = { savedAt: '2026-10-27T09:30:00.000Z', readable: true };
    window.history.pushState({}, '', '/mcps/notion-id/api-key');

    render(<App />);

    expect({
      saved: (await screen.findByText('Saved on Oct 27, 2026')) !== null,
      field: screen.queryByLabelText('API key') !== null,
      back: screen.getByRole('link', { name: 'Back to My MCPs' }).getAttribute('href'),
      steps: screen.queryByRole('navigation', { name: /steps/i }) !== null,
    }).toEqual({ saved: true, field: false, back: '/mcps', steps: false });
  });

  it('greys "Save" during the call: a double click saves once (idiom)', async () => {
    server.mcps = [NOTION];
    let answer = () => {};
    server.held = new Promise<void>((resolve) => (answer = resolve));
    const user = userEvent.setup();
    render(<ApiKeyScreen mcpId="notion-id" />);
    await user.click(await screen.findByLabelText('API key'));
    await user.paste('secret_ntn_1234');
    const save = screen.getByRole('button', { name: 'Save' });

    await user.dblClick(save);
    const greyedDuringTheCall = save.hasAttribute('disabled');
    answer();
    await screen.findByText('Saved on Oct 28, 2026');

    expect({ greyedDuringTheCall, saves: server.saved.length }).toEqual({ greyedDuringTheCall: true, saves: 1 });
  });

  it('never shows the key once saved, neither in the field nor anywhere on the page (contract 14, D3)', async () => {
    server.mcps = [NOTION];
    const user = userEvent.setup();
    render(<ApiKeyScreen mcpId="notion-id" />);

    await user.click(await screen.findByLabelText('API key'));
    await user.paste('secret_ntn_1234');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved on Oct 28, 2026');

    expect({
      inThePage: document.body.innerHTML.includes('secret_ntn_1234'),
      inAField: Array.from(document.querySelectorAll('input'), (input) => input.value).includes('secret_ntn_1234'),
    }).toEqual({ inThePage: false, inAField: false });
  });

  // The server answers another account's MCP exactly as an unknown one: one case for the page.
  it("says the MCP is not found at the address of an unknown MCP or of another account's, as Usage does, with no field (contract 17, D13)", async () => {
    server.mcps = [NOTION];
    window.history.pushState({}, '', '/mcps/someone-elses-id/api-key');

    render(<App />);

    const notFound = await screen.findByRole('heading', { name: 'MCP not found' });
    const message = screen.getByText('There is no MCP at this address in your account.');
    expect({
      notFound: notFound !== null,
      spaced: message.classList.contains('mt-4'),
      field: screen.queryByLabelText('API key') !== null,
      back: screen.getByRole('link', { name: 'Back to My MCPs' }).getAttribute('href'),
    }).toEqual({ notFound: true, spaced: true, field: false, back: '/mcps' });
  });
});

describe('Replacing or removing the key', () => {
  it('replaces the key: "Replace" opens the field, "Save" shows the new key saved on the day of the save (D3)', async () => {
    server.mcps = [NOTION];
    server.keys['notion-id'] = { savedAt: '2026-10-27T09:30:00.000Z', readable: true };
    const user = userEvent.setup();
    render(<ApiKeyScreen mcpId="notion-id" />);

    await user.click(await screen.findByRole('button', { name: 'Replace' }));
    await user.click(screen.getByLabelText('API key'));
    await user.paste('secret_ntn_5678');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect({
      saved: (await screen.findByText('Saved on Oct 28, 2026')) !== null,
      sent: server.saved,
    }).toEqual({ saved: true, sent: ['secret_ntn_5678'] });
  });
});
