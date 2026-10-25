import { useState, type ReactNode } from 'react';
import { authClient } from '../lib/auth-client';
import { SignInScreen } from '../screens/sign-in';

/** Nothing of SLICE shows without an account (D1): the app with a live session, else the sign-in screen. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  // Blank only until the server first answers: a later re-check (tab refocused)
  // keeps the screen on display instead of unmounting it.
  const [answered, setAnswered] = useState(false);
  if (!isPending && !answered) setAnswered(true);
  if (!answered && isPending) return null;
  return data ? <>{children}</> : <SignInScreen />;
}
