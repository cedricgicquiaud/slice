/**
 * Nothing works without an account (D1): an API call goes through only with a
 * live session, and carries on with the account's workspace in
 * `res.locals.workspaceId`. Without `auth`, no session can exist, so every call
 * is refused. An unreachable database is an outage (503), never a missing session.
 */
import type { RequestHandler } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import type { ApiErrorPayload } from '@shared/types';
import type { SliceAuth } from '../auth/auth';
import { isDatabaseUnreachable } from '../db/errors';

declare global {
  namespace Express {
    interface Locals {
      /** The signed-in account's workspace, set by `requireSession` (D15). */
      workspaceId: string;
    }
  }
}

const UNAUTHORIZED: ApiErrorPayload = { code: 'UNAUTHORIZED', message: 'Sign in to continue.' };
const UNAVAILABLE: ApiErrorPayload = {
  code: 'SERVICE_UNAVAILABLE',
  message: 'SLICE is unavailable for the moment. Try again in a few minutes.',
};

export function requireSession(auth: SliceAuth | undefined): RequestHandler {
  return async (req, res, next) => {
    try {
      const session = auth ? await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }) : null;
      if (!auth || !session) {
        res.status(401).json(UNAUTHORIZED);
        return;
      }
      const workspaceId = await auth.workspaceOf(session.user.id);
      // Every account gets its workspace at sign-up: one without is a bug, not a refusal.
      if (!workspaceId) throw new Error(`account ${session.user.id} has no workspace`);
      res.locals.workspaceId = workspaceId;
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
