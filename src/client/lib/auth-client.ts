import { createAuthClient } from 'better-auth/react';

/** Better Auth's routes on the page's own origin (`/api/auth`, proxied to the API in dev). */
export const authClient = createAuthClient();
