import { cleanStores } from 'nanostores';
import { authClient } from './lib/auth-client';

/**
 * Stops the auth client's session at once (WAT-166). Left alone, the session
 * stops 1 s after its last screen unmounts (nanostores' delay): when a test
 * file ends sooner, the stop runs once `window` is gone and fails the run with
 * "window is not defined". The test setup calls this after each file.
 */
export function stopAuthClient(): void {
  // `atoms` lists nothing (the client is a proxy): the session is named.
  cleanStores(authClient.$store.atoms.session);
}
