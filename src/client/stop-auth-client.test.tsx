// WAT-166 — a screen test leaves no timer of the auth client running once it ends.
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { authClient } from './lib/auth-client';
import { stopAuthClient } from './stop-auth-client';

/** Nobody is signed in. Set before any import: the auth client keeps the `fetch` it finds when loaded. */
vi.hoisted(() => {
  globalThis.fetch = (async () =>
    new Response('null', { headers: { 'content-type': 'application/json' } })) as typeof fetch;
});

/** A screen that reads the session, as the sign-in gate does. */
function ReadsSession() {
  authClient.useSession();
  return null;
}

describe('stopAuthClient', () => {
  it('stops the session at once, not a second after its last screen is gone (WAT-166)', () => {
    // Left alone, the session stops 1 s after unmount: by then the test file may be over and
    // `window` gone, and the stop throws "window is not defined" (CI of PR #76).
    const screen = render(<ReadsSession />);
    screen.unmount();
    const removed = vi.spyOn(window, 'removeEventListener');

    stopAuthClient();

    expect(removed.mock.calls.map(([type]) => type)).toContain('storage');
  });

  it('does nothing when no screen ever read the session', () => {
    expect(() => stopAuthClient()).not.toThrow();
  });
});
