// WAT-106 — I delete my account from /account/delete, once `delete` is typed.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { DeleteAccountScreen } from './delete-account';

/**
 * SLICE's API as this page sees it: any call is "who is signed in?" (`session`).
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const state: { session: unknown } = { session: null };
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(state.session), { headers: { 'content-type': 'application/json' } })) as typeof fetch;
  return state;
});

afterEach(() => {
  server.session = null;
  window.history.pushState({}, '', '/');
});

describe('Delete account', () => {
  it('opens at /account/delete with the deletion page, without the steps at the top', async () => {
    window.history.pushState({}, '', '/account/delete');

    render(<App />);

    expect({
      page: (await screen.findByRole('heading', { name: 'Delete your account' })) !== null,
      steps: screen.queryByRole('navigation', { name: /steps/i }) !== null,
    }).toEqual({ page: true, steps: false });
  });

  it('says what disappears: the account and its MCPs (D11)', () => {
    render(<DeleteAccountScreen />);

    expect(screen.getByText(/your account and all its MCPs are deleted at once/i)).toBeInTheDocument();
  });

  it.each(['', 'Delete', 'delet'])('keeps the button inactive while "%s" is typed (contract 27)', async (typed) => {
    const user = userEvent.setup();
    render(<DeleteAccountScreen />);

    if (typed) await user.type(screen.getByLabelText('Type delete to confirm'), typed);

    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeDisabled();
  });

  it('activates the button once delete is typed (D11)', async () => {
    const user = userEvent.setup();
    render(<DeleteAccountScreen />);

    await user.type(screen.getByLabelText('Type delete to confirm'), 'delete');

    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeEnabled();
  });
});
