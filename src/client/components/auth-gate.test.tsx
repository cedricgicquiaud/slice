// WAT-96 — without an account, every address of SLICE shows the sign-in screen.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { AuthGate } from './auth-gate';

/** The server's answer to "who is signed in?" (`GET /api/auth/get-session`). */
function serverSession(session: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(session), { headers: { 'content-type': 'application/json' } }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
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
    serverSession({
      session: { id: 's1', userId: 'u1', token: 't', expiresAt: '2026-10-31T00:00:00.000Z' },
      user: { id: 'u1', email: 'ada@example.com', name: '', emailVerified: true },
    });

    render(
      <AuthGate>
        <App />
      </AuthGate>
    );

    expect(await screen.findByRole('heading', { name: /any api, in any agent/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in to SLICE' })).not.toBeInTheDocument();
  });
});
