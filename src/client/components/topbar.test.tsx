import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Topbar } from './topbar';

/**
 * The server signs `ada@example.com` in (`GET /api/auth/get-session`).
 * Set before any import: the auth client keeps the `fetch` it finds when loaded.
 */
vi.hoisted(() => {
  const session = {
    session: { id: 's1', userId: 'u1', token: 't', expiresAt: '2026-11-01T00:00:00.000Z' },
    user: { id: 'u1', email: 'ada@example.com', name: '', emailVerified: true },
  };
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(session), { headers: { 'content-type': 'application/json' } })) as typeof fetch;
});

describe('Topbar', () => {
  it('renders the SLICE wordmark', () => {
    render(<Topbar current={1} apiName={null} onReset={() => {}} onToggleTheme={() => {}} />);
    expect(screen.getByText('SLICE')).toBeInTheDocument();
  });

  it('shows the API name when provided', () => {
    render(<Topbar current={2} apiName="Shopify Admin API" onReset={() => {}} onToggleTheme={() => {}} />);
    expect(screen.getByText('Shopify Admin API')).toBeInTheDocument();
  });

  it('hides the API name on step 1 when null', () => {
    render(<Topbar current={1} apiName={null} onReset={() => {}} onToggleTheme={() => {}} />);
    expect(screen.queryByText(/shopify/i)).not.toBeInTheDocument();
  });

  it('shows the address of the signed-in account', async () => {
    render(<Topbar current={1} apiName={null} onReset={() => {}} onToggleTheme={() => {}} />);
    expect(await screen.findByRole('button', { name: 'ada@example.com' })).toBeInTheDocument();
  });

  it('renders the Stepper with the current step', () => {
    render(<Topbar current={2} apiName="x" onReset={() => {}} onToggleTheme={() => {}} />);
    expect(screen.getByRole('navigation', { name: /steps/i })).toBeInTheDocument();
  });

  it('shows no steps on a page outside them (My MCPs)', () => {
    render(<Topbar current={null} apiName={null} onReset={() => {}} onToggleTheme={() => {}} />);
    expect(screen.queryByRole('navigation', { name: /steps/i })).not.toBeInTheDocument();
  });

  it('calls onReset when the Reset button is clicked', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<Topbar current={2} apiName="x" onReset={onReset} onToggleTheme={() => {}} />);
    await user.click(screen.getByRole('button', { name: /reset/i }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('calls onToggleTheme when the theme button is clicked', async () => {
    const user = userEvent.setup();
    const onToggleTheme = vi.fn();
    render(
      <Topbar current={1} apiName={null} onReset={() => {}} onToggleTheme={onToggleTheme} />
    );
    await user.click(screen.getByRole('button', { name: /toggle theme/i }));
    expect(onToggleTheme).toHaveBeenCalledOnce();
  });

  it('passes onNavigate to done steps in the Stepper', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <Topbar current={3} apiName="x" onReset={() => {}} onToggleTheme={() => {}} onNavigate={onNavigate} />
    );
    await user.click(screen.getByRole('button', { name: /back to upload/i }));
    expect(onNavigate).toHaveBeenCalledWith(1);
  });
});
