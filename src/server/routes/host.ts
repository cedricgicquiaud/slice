/**
 * Pivot-4 — POST /api/host
 *
 * Re-validates and re-parses the spec (same hardening as /api/generate —
 * never trust the client parse), distills the selection into a HostedMcpConfig,
 * stores it under an unguessable id in the signed-in account's workspace, and
 * returns `{ id, url }`. The hosted runtime (`/m/:id`) then serves it on demand.
 * No secret is stored.
 */
import { Router, type RequestHandler, json } from 'express';
import { generateRequestSchema } from '@shared/config-schema';
import { ApiError, type ApiErrorPayload, type SliceConfig } from '@shared/types';
import { reparseAndSelect } from '../services/reparse-and-select';
import { specToHostedConfig } from '../services/spec-to-hosted-config';
import type { HostedStore } from '../services/hosted-store';
import { assertPublicUrl, SsrfError } from '../services/ssrf-guard';
import { isDatabaseUnreachable } from '../db/errors';

const BODY_LIMIT = '15mb';

export interface HostRouterOptions {
  /** Where the created connectors are stored. */
  store: HostedStore;
  /** Clock that dates a created connector. */
  now: () => Date;
  /** When false (production default), SSRF-guard the user-supplied baseUrl. */
  allowPrivateHosts?: boolean;
  /** SLICE's public address, where the returned URL starts (D5). Without it, the address the request reached. */
  publicUrl?: string;
}

export function createHostRouter(options: HostRouterOptions): Router {
  const router = Router();
  router.use(json({ limit: BODY_LIMIT }));
  router.use(((err, _req, res, next) => {
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
      res.status(413).json(payload('PAYLOAD_TOO_LARGE', 'Spec is too large (max 15 MB).'));
      return;
    }
    next(err);
  }) as import('express').ErrorRequestHandler);
  router.post('/', makeHandleHost(options.store, options.now, options.allowPrivateHosts ?? false, options.publicUrl));
  return router;
}

const makeHandleHost = (
  store: HostedStore,
  now: () => Date,
  allowPrivateHosts: boolean,
  publicUrl: string | undefined
): RequestHandler => async (req, res, next) => {
  const parsed = generateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(payload('INVALID_SPEC', firstZodMessage(parsed.error)));
    return;
  }
  const body = parsed.data;

  try {
    // Re-parse server-side + whitelist the selection (never trust the client
    // parse) — shared with /api/generate.
    const { reparsed, validIds } = await reparseAndSelect(body.rawSpec, body.selectedIds, 'host');

    const config = specToHostedConfig(reparsed, validIds, body.config as SliceConfig);

    // SSRF guard: the hosted runtime will fetch `config.baseUrl` from SLICE's
    // own network. Reject loopback/private/link-local/metadata hosts up front
    // so we never store a config that could be used as an open proxy.
    if (!allowPrivateHosts) {
      try {
        await assertPublicUrl(config.baseUrl);
      } catch (err) {
        if (err instanceof SsrfError) {
          throw new ApiError('BLOCKED_HOST', 'The API base URL points to a non-public host.', 400);
        }
        throw err;
      }
    }

    const { id } = await store.put(config, res.locals.workspaceId, now()).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[host] storing the connector failed:', err instanceof Error ? err.message : err);
      // Anything but an outage is a bug: let it surface as a server error.
      if (!isDatabaseUnreachable(err)) throw err;
      throw new ApiError(
        'SERVICE_UNAVAILABLE',
        'Hosting is unavailable for the moment. Try again in a few minutes.',
        503
      );
    });
    const url = `${publicUrl ?? `${req.protocol}://${req.get('host')}`}/m/${id}`;
    res.status(200).json({ id, url });
  } catch (err) {
    if (err instanceof ApiError) {
      res.status(err.status).json(payload(err.code, err.message));
      return;
    }
    next(err);
  }
};

function payload(code: ApiErrorPayload['code'], message: string): ApiErrorPayload {
  return { code, message };
}

function firstZodMessage(err: import('zod').ZodError): string {
  const issue = err.issues[0];
  if (!issue) return 'Invalid request body.';
  const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue.message}`;
}
