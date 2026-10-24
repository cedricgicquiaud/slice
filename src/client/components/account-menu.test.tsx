// WAT-100 — signed in, my address shows at the top right; its menu leads to my MCPs, sign-out and account deletion.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { authClient } from '../lib/auth-client';
import { AccountMenu } from './account-menu';

/**
 * The server's answer to "who is signed in?" (`GET /api/auth/get-session`).
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const state: { session: unknown } = { session: null };
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(state.session), { headers: { 'content-type': 'application/json' } })) as typeof fetch;
  return state;
});

/** The server now answers `session`; like a sign-in or out, the client is told to ask again. */
function serverSession(session: unknown) {
  server.session = session;
  authClient.$store.notify('$sessionSignal');
}

function signedInAs(email: string) {
  serverSession({
    session: { id: 's1', userId: 'u1', token: 't', expiresAt: '2026-11-01T00:00:00.000Z' },
    user: { id: 'u1', email, name: '', emailVerified: true },
  });
}

describe('AccountMenu', () => {
  it('shows the address of the signed-in account', async () => {
    signedInAs('ada@example.com');

    render(<AccountMenu />);

    expect(await screen.findByRole('button', { name: 'ada@example.com' })).toBeInTheDocument();
  });

  it('offers My MCPs, Sign out and Delete account once the address is clicked', async () => {
    signedInAs('ada@example.com');
    render(<AccountMenu />);

    await userEvent.click(await screen.findByRole('button', { name: 'ada@example.com' }));

    const menu = within(screen.getByRole('menu'));
    expect({
      myMcps: menu.getByRole('menuitem', { name: 'My MCPs' }).getAttribute('href'),
      signOut: menu.queryByRole('menuitem', { name: 'Sign out' }) !== null,
      deleteAccount: menu.getByRole('menuitem', { name: 'Delete account' }).getAttribute('href'),
    }).toEqual({ myMcps: '/mcps', signOut: true, deleteAccount: '/account/delete' });
  });
});
