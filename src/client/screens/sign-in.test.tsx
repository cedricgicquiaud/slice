// WAT-96 — the sign-in screen: Google, Microsoft or a code by email, never a password.
// WAT-97 — Google or Microsoft lead to their sign-in; an unverified address sends to the code.
// WAT-98 — a code by email: asked for with the address, then entered to sign in.
// WAT-99 — every refused code, or refused request for one, says why.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInScreen } from './sign-in';

/**
 * The server, as the auth client calls it: every request is recorded; a route
 * answers what `answers` holds for the end of its path, and otherwise, like a
 * sign-in start, with the provider's address to go to.
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
const server = vi.hoisted(() => {
  const requests: { url: string; body: unknown }[] = [];
  const answers = new Map<string, { status: number; body: unknown }>();
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const path = new URL(url, 'http://slice.test').pathname;
    const answer = [...answers].find(([end]) => path.endsWith(end))?.[1] ?? {
      status: 200,
      body: { url: 'https://provider.example/authorize', redirect: true },
    };
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { requests, answers };
});

afterEach(() => {
  window.history.pushState({}, '', '/');
  server.requests.length = 0;
  server.answers.clear();
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

  it('asks the server for a code sent to the address typed', async () => {
    server.answers.set('/email-otp/send-verification-otp', { status: 200, body: { success: true } });
    render(<SignInScreen />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));

    await waitFor(() =>
      expect(server.requests).toContainEqual({
        url: expect.stringMatching(/\/api\/auth\/email-otp\/send-verification-otp$/),
        body: { email: 'ada@example.com', type: 'sign-in' },
      })
    );
  });

  it('signs in with the code received, entered once it was sent', async () => {
    server.answers.set('/email-otp/send-verification-otp', { status: 200, body: { success: true } });
    render(<SignInScreen />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Code' }), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(server.requests).toContainEqual({
        url: expect.stringMatching(/\/api\/auth\/sign-in\/email-otp$/),
        body: { email: 'ada@example.com', otp: '123456' },
      })
    );
  });

  it("says the code couldn't be sent when the server could not send it (contract 14)", async () => {
    server.answers.set('/email-otp/send-verification-otp', {
      status: 502,
      body: { code: 'code_not_sent', message: "Couldn't send the code, try again." },
    });
    render(<SignInScreen />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't send the code, try again");
  });

  it('says the code is wrong when the server refuses it (contract 18)', async () => {
    server.answers.set('/email-otp/send-verification-otp', { status: 200, body: { success: true } });
    server.answers.set('/sign-in/email-otp', { status: 400, body: { code: 'INVALID_OTP', message: 'Invalid OTP' } });
    render(<SignInScreen />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Code' }), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This code is wrong or was already used.');
  });

  it('asks for a new code, and offers to send one, after too many wrong codes (contract 18)', async () => {
    server.answers.set('/email-otp/send-verification-otp', { status: 200, body: { success: true } });
    server.answers.set('/sign-in/email-otp', { status: 403, body: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts' } });
    render(<SignInScreen />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Code' }), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many wrong codes. Ask for a new one.');
    expect(screen.getByRole('button', { name: 'Email me a code' })).toBeInTheDocument();
  });
});
