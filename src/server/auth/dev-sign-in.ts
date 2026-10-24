/**
 * Dev only — POST /api/dev/sign-in opens a session for the recette account, so
 * the visual test pass (`.pilot/amorce-recette.js`) gets past the sign-in
 * screen. `createApp` never mounts it in production.
 */
import type { RequestHandler } from 'express';
import type { SliceAuth } from './auth';
import { openSession } from './open-session';

const RECETTE_EMAIL = 'recette@slice.local';

export function devSignIn(auth: SliceAuth): RequestHandler {
  return async (_req, res, next) => {
    try {
      const { name, value } = await openSession(auth, RECETTE_EMAIL);
      // Better Auth reads the signed value verbatim: no URL-encoding.
      res.cookie(name, value, { httpOnly: true, sameSite: 'lax', path: '/', encode: String });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };
}
