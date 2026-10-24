// WAT-96 — without an account, every address of SLICE shows the sign-in screen.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GenerateRequest } from '@shared/types';
import App from '../App';
import { apiHost } from '../lib/api';
import { authClient } from '../lib/auth-client';
import { AuthGate } from './auth-gate';

/**
 * The server's answer to "who is signed in?" (`GET /api/auth/get-session`),
 * and its refusal of any `/api/*` call made without a live session.
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const state: { session: unknown } = { session: null };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input) === '/api/host' && !state.session) {
      return new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Sign in to continue.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(state.session), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return state;
});

const LIVE_SESSION = {
  session: { id: 's1', userId: 'u1', token: 't', expiresAt: '2026-10-31T00:00:00.000Z' },
  user: { id: 'u1', email: 'ada@example.com', name: '', emailVerified: true },
};

/** The server now answers `session`; like a sign-in or out, the client is told to ask again. */
function serverSession(session: unknown) {
  server.session = session;
  authClient.$store.notify('$sessionSignal');
}

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('AuthGate', () => {
  it.each(['/', '/mcps'])('shows the sign-in screen, not the app, at %s without a session', async (path) => {
    window.history.pushState({}, '', path);
    serverSession(null);

    render(
      <AuthGate>
        <App />
      </AuthGate>
    );

    expect(await screen.findByRole('heading', { name: 'Sign in to SLICE' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /any api, in any agent/i })).not.toBeInTheDocument();
  });

  it('shows the app, not the sign-in screen, with a live session', async () => {
    serverSession(LIVE_SESSION);

    render(
      <AuthGate>
        <App />
      </AuthGate>
    );

    expect(await screen.findByRole('heading', { name: /any api, in any agent/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in to SLICE' })).not.toBeInTheDocument();
  });

  // WAT-101 — contract 13: the session ran out while the app was on screen.
  it('shows the sign-in screen when the server refuses Deploy to SLICE Cloud for want of a session', async () => {
    serverSession(LIVE_SESSION);
    const deploy = { parsedSpec: {}, rawSpec: '', selectedIds: [], config: {} } as unknown as GenerateRequest;
    render(
      <AuthGate>
        <button onClick={() => apiHost(deploy).catch(() => {})}>Deploy to SLICE Cloud</button>
      </AuthGate>
    );
    const button = await screen.findByRole('button', { name: 'Deploy to SLICE Cloud' });
    server.session = null;

    await userEvent.click(button);

    expect(await screen.findByRole('heading', { name: 'Sign in to SLICE' })).toBeInTheDocument();
  });
});
