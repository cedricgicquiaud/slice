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
const FOREIGN_ORIGIN: ApiErrorPayload = { code: 'FORBIDDEN', message: 'SLICE takes orders from its own page only.' };
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

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * SLICE takes an account's orders from its own page only (D16): a write sent
 * by a browser from another site is refused, session or not.
 */
export function requireSameOrigin(): RequestHandler {
  return (req, res, next) => {
    const origin = req.get('origin');
    if (READS.has(req.method) || origin === undefined || origin === `${req.protocol}://${req.get('host')}`) {
      next();
      return;
    }
    res.status(403).json(FOREIGN_ORIGIN);
  };
}
