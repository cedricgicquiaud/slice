// WAT-106 — I delete my account from /account/delete, once `delete` is typed.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { AuthGate } from '../components/auth-gate';
import { refreshSession } from '../lib/auth-client';
import { DeleteAccountScreen } from './delete-account';

const LIVE_SESSION = {
  session: { id: 's1', userId: 'u1', token: 't', expiresAt: '2026-11-01T00:00:00.000Z' },
  user: { id: 'u1', email: 'ada@example.com', name: '', emailVerified: true },
};

/**
 * SLICE's API as this page sees it: `POST /api/auth/delete-user` deletes the
 * account and ends its session (counted in `deletions`), or answers
 * `deletionRefusal` when set; any other call is "who is signed in?" (`session`).
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const state: {
    session: unknown;
    deletions: number;
    deletionRefusal: { status: number; code: string; message: string } | null;
  } = { session: null, deletions: 0, deletionRefusal: null };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith('/api/auth/delete-user') && state.deletionRefusal) {
      const { status, code, message } = state.deletionRefusal;
      return json({ code, message }, status);
    }
    if (url.endsWith('/api/auth/delete-user')) {
      state.deletions += 1;
      state.session = null;
      return json({ success: true, message: 'User deleted' });
    }
    return json(state.session);
  }) as typeof fetch;
  return state;
});

/** The server now answers `session`; like a sign-in or out, the client is told to ask again. */
function serverSession(session: unknown) {
  server.session = session;
  refreshSession();
}

afterEach(() => {
  server.session = null;
  server.deletions = 0;
  server.deletionRefusal = null;
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

  it('never mentions a space, the personal one being invisible (contract 30, D15)', async () => {
    const user = userEvent.setup();
    const { container } = render(<DeleteAccountScreen />);

    await user.type(screen.getByLabelText('Type delete to confirm'), 'delete');

    expect(container.textContent).not.toMatch(/space/i);
  });

  it('deletes the account at once when clicked, and lands on the sign-in screen at / (D11, D1)', async () => {
    window.history.pushState({}, '', '/account/delete');
    serverSession(LIVE_SESSION);
    const user = userEvent.setup();
    render(
      <AuthGate>
        <App />
      </AuthGate>
    );

    await user.type(await screen.findByLabelText('Type delete to confirm'), 'delete');
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect({
      signIn: (await screen.findByRole('heading', { name: 'Sign in to SLICE' })) !== null,
      deletions: server.deletions,
      path: window.location.pathname,
    }).toEqual({ signIn: true, deletions: 1, path: '/' });
  });

  // Without a password, Better Auth deletes only from a session opened less than a day ago.
  it('asks to sign in again when the session is too old to delete the account, and stays on the page', async () => {
    window.history.pushState({}, '', '/account/delete');
    server.deletionRefusal = {
      status: 400,
      code: 'SESSION_EXPIRED',
      message: 'Session expired. Re-authenticate to perform this action.',
    };
    const user = userEvent.setup();
    render(<DeleteAccountScreen />);

    await user.type(screen.getByLabelText('Type delete to confirm'), 'delete');
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect({
      message: (await screen.findByRole('alert')).textContent,
      path: window.location.pathname,
    }).toEqual({
      message: 'For your safety, sign out and sign in again, then delete your account.',
      path: '/account/delete',
    });
  });
});
