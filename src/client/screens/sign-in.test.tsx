// WAT-96 — the sign-in screen: Google, Microsoft or a code by email, never a password.
// WAT-97 — Google or Microsoft lead to their sign-in; an unverified address sends to the code.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInScreen } from './sign-in';

/**
 * The server, as the auth client calls it: every request is recorded, and a
 * sign-in start answers with the provider's address to go to.
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const requests: { url: string; body: unknown }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify({ url: 'https://provider.example/authorize', redirect: true }), {
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { requests };
});

afterEach(() => {
  window.history.pushState({}, '', '/');
  server.requests.length = 0;
});

describe('SignInScreen', () => {
  it('offers three ways in: Google, Microsoft and a code sent by email', () => {
    render(<SignInScreen />);

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Microsoft' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Email me a code' })).toBeInTheDocument();
  });

  it('never asks for a password', () => {
    const { container } = render(<SignInScreen />);

    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.textContent).not.toMatch(/password/i);
  });

  it('never mentions a space (D15: the personal one stays invisible)', () => {
    const { container } = render(<SignInScreen />);

    expect(container.textContent).not.toMatch(/space/i);
  });

  // Where the server sends a refused sign-in back (D6): a new address, or the address of an existing account.
  it.each(['email_not_verified', 'account_not_linked'])(
    'sends to the code by email when Google or Microsoft did not verify the address (%s)',
    (code) => {
      window.history.pushState({}, '', `/?error=${code}`);

      render(<SignInScreen />);

      expect(screen.getByRole('alert')).toHaveTextContent(
        "Your Google or Microsoft account didn't confirm this email address. Get a code by email instead."
      );
    }
  );

  it.each(['unknown_code', 'toString'])('shows no message for a code it does not know (%s)', (code) => {
    window.history.pushState({}, '', `/?error=${code}`);

    render(<SignInScreen />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['Continue with Google', 'google'],
    ['Continue with Microsoft', 'microsoft'],
  ])('starts the sign-in with its provider on "%s", a refusal coming back to this screen', async (button, provider) => {
    render(<SignInScreen />);

    await userEvent.click(screen.getByRole('button', { name: button }));

    await waitFor(() =>
      expect(server.requests).toContainEqual({
        url: expect.stringMatching(/\/api\/auth\/sign-in\/social$/),
        body: expect.objectContaining({ provider, errorCallbackURL: '/' }),
      })
    );
  });
});
