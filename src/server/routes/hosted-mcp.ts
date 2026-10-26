/**
 * Pivot-4 — the hosted runtime endpoint: `ALL /m/:id`.
 *
 * Looks up the stored config by id, builds an `McpServer` on demand
 * (`buildHostedMcpServer`), and serves it in **stateless** mode — a fresh
 * transport per request, so any number of agents can hit any number of MCPs
 * concurrently with no shared session state. The incoming `Authorization`
 * header is captured per request and relayed to the upstream; nothing stored.
 */
import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildHostedMcpServer, relayStore, type HostedMcpConfig } from '../services/hosted-mcp-factory';
import type { HostedStore } from '../services/hosted-store';
import { isDatabaseUnreachable } from '../db/errors';

export interface HostedMcpRouterOptions {
  /** Where the hosted connectors are read from. */
  store: HostedStore;
  /** Forwarded to the engine — disables the SSRF guard (tests/dev only). */
  allowPrivateHosts?: boolean;
}

// An MCP never expires (WAT-102, D2): the expiry below stays in the code but
// nothing calls it. Plugging it back means testing `isExpired` again in the
// route below, before serving the connector.

/** Env-resolved default TTL (hours). `0` disables expiry (self-host deployments). */
export function defaultTtlHours(): number {
  const parsed = Number(process.env.SLICE_HOSTED_TTL_HOURS ?? '72');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 72;
}

export function isExpired(createdAt: string | undefined, ttlHours: number, now = Date.now()): boolean {
  if (ttlHours <= 0 || !createdAt) return false;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  return now - created > ttlHours * 3_600_000;
}

/** What an agent reads when it calls an action the MCP's active version lacks (D7). */
export const ACTION_GONE =
  'This action is no longer available in this MCP. Start a new conversation to get the current list of actions.';

/** The JSON-RPC id and the action's name of a `tools/call` request, else `undefined`. */
function actionCall(body: unknown): { id: string | number; name: string } | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { method, id, params } = body as { method?: unknown; id?: unknown; params?: { name?: unknown } };
  if (method !== 'tools/call' || typeof params?.name !== 'string') return undefined;
  if (typeof id !== 'string' && typeof id !== 'number') return undefined;
  return { id, name: params.name };
}

export function createHostedMcpRouter(options: HostedMcpRouterOptions): Router {
  const router = Router();

  router.all('/:id', async (req, res) => {
    let config: HostedMcpConfig | undefined;
    try {
      config = await options.store.get(req.params.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[hosted-mcp] reading the connector failed:', err instanceof Error ? err.message : err);
      // Anything but an outage is a bug: Express turns the rejection into a server error.
      if (!isDatabaseUnreachable(err)) throw err;
      // The database is out of reach: the connector may well exist, never call it unknown.
      res.status(503).json({ error: 'This MCP is unavailable for the moment. Try again in a few minutes.' });
      return;
    }
    if (!config) {
      res.status(404).json({ error: 'Unknown MCP id.' });
      return;
    }
    // An agent connected before a "Save" may still call an action the active version lacks (D7):
    // it is told to start over, and the API is never called.
    const call = actionCall(req.body);
    if (call && !config.endpoints.some((endpoint) => endpoint.name === call.name)) {
      res.json({ jsonrpc: '2.0', id: call.id, result: { content: [{ type: 'text', text: ACTION_GONE }], isError: true } });
      return;
    }
    const server = buildHostedMcpServer(config, {
      allowPrivateHosts: options.allowPrivateHosts,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      const authorization = req.headers.authorization ?? '';
      await relayStore.run({ authorization }, async () => {
        await transport.handleRequest(req, res, req.body);
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[hosted-mcp] request failed:', err instanceof Error ? err.stack : err);
      if (!res.headersSent) res.status(500).json({ error: 'Internal error.' });
    }
  });

  return router;
}
