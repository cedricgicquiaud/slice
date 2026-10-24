/**
 * Nothing works without an account (D1): an API call goes through only with a
 * live session. Without `auth`, no session can exist, so every call is refused.
 */
import type { RequestHandler } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import type { ApiErrorPayload } from '@shared/types';
import type { SliceAuth } from '../auth/auth';

const UNAUTHORIZED: ApiErrorPayload = { code: 'UNAUTHORIZED', message: 'Sign in to continue.' };

export function requireSession(auth: SliceAuth | undefined): RequestHandler {
  return async (req, res, next) => {
    try {
      const session = auth ? await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }) : null;
      if (!session) {
        res.status(401).json(UNAUTHORIZED);
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
