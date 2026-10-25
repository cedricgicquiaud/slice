// WAT-106 — I delete my account from /account/delete, once `delete` is typed.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

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
});
