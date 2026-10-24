/**
 * Nothing works without an account (D1): an API call goes through only with a
 * live session. Without `auth`, no session can exist, so every call is refused.
 * An unreachable database is an outage (503), never a missing session.
 */
import type { RequestHandler } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import type { ApiErrorPayload } from '@shared/types';
import type { SliceAuth } from '../auth/auth';
import { isDatabaseUnreachable } from '../db/errors';

const UNAUTHORIZED: ApiErrorPayload = { code: 'UNAUTHORIZED', message: 'Sign in to continue.' };
const UNAVAILABLE: ApiErrorPayload = {
  code: 'SERVICE_UNAVAILABLE',
  message: 'SLICE is unavailable for the moment. Try again in a few minutes.',
};

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
      if (isDatabaseUnreachable(err)) {
        res.status(503).json(UNAVAILABLE);
        return;
      }
      next(err);
    }
  };
}
