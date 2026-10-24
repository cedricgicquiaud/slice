// WAT-96 — the sign-in screen: Google, Microsoft or a code by email, never a password.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignInScreen } from './sign-in';

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
});
