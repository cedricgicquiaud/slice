import { createAuthClient } from 'better-auth/react';
import { emailOTPClient } from 'better-auth/client/plugins';

/** Better Auth's routes on the page's own origin (`/api/auth`, proxied to the API in dev). */
export const authClient = createAuthClient({ plugins: [emailOTPClient()] });

/**
 * Has the auth client ask the server for the session again, as after a sign-in
 * or out. Better Auth exposes no public call for it: this undocumented signal
 * is the one line to check when Better Auth is upgraded.
 */
export function refreshSession(): void {
  authClient.$store.notify('$sessionSignal');
}
