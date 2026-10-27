import '@testing-library/jest-dom/vitest';
import { afterAll } from 'vitest';

// The auth client's session stops 1 s after its last screen: stopped now, it
// never runs once the file's `window` is gone (WAT-166). Loaded here, not
// imported above: the auth client keeps the `fetch` it finds when loaded, and
// each test file sets its own first.
afterAll(async () => {
  const { stopAuthClient } = await import('./stop-auth-client');
  stopAuthClient();
});
