import type { ReactNode } from 'react';
import { SignInScreen } from '../screens/sign-in';

export function AuthGate(_props: { children: ReactNode }) {
  return <SignInScreen />;
}
