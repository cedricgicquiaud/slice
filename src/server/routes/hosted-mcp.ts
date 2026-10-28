/**
 * Pivot-4 — the hosted runtime endpoint: `ALL /m/:id`.
 *
 * Looks up the stored config by id, builds an `McpServer` on demand
 * (`buildHostedMcpServer`), and serves it in **stateless** mode — a fresh
 * transport per request, so any number of agents can hit any number of MCPs
 * concurrently with no shared session state. The incoming `Authorization`
 * header is captured per request and relayed to the upstream; nothing stored.
 * Each action call is noted (WAT-154): its action, version, date, result and
 * duration, written once the response is gone.
 */
import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ErrorCode,
  isJSONRPCErrorResponse,
  isJSONRPCResultResponse,
  type JSONRPCErrorResponse,
  type JSONRPCMessage,
  type JSONRPCResultResponse,
} from '@modelcontextprotocol/sdk/types.js';
import { buildHostedMcpServer, relayStore, type HostedMcpConfig } from '../services/hosted-mcp-factory';
import type { HostedStore } from '../services/hosted-store';
import type { CallNote, CallResult, McpCalls } from '../services/mcp-calls';
import type { McpApiKey, McpApiKeys } from '../services/mcp-api-key';
import { isDatabaseUnreachable } from '../db/errors';

export interface HostedMcpRouterOptions {
  /** Where the hosted connectors are read from. */
  store: HostedStore;
  /** Where the notes of action calls are written. Without it, no call is noted. */
  calls?: McpCalls;
  /** The keys saved on SLICE for the MCPs. Without them, every call relays the agent's key only. */
  apiKeys?: McpApiKeys;
  /** Clock that dates the arrival of a call. Defaults to the system clock. */
  now?: () => Date;
  /** Forwarded to the engine — disables the SSRF guard (tests/dev only). */
  allowPrivateHosts?: boolean;
  /** Forwarded to the engine — how long an action waits for the API. Defaults to the engine's 30 seconds. */
  upstreamTimeoutMs?: number;
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

/**
 * Whether a response is the SDK's refusal of a call's values (`validateToolInput`),
 * made before SLICE's code runs: a tool error that starts with the code of invalid params.
 */
function refusesValues(message: JSONRPCMessage): message is JSONRPCResultResponse | JSONRPCErrorResponse {
  if (isJSONRPCErrorResponse(message)) return message.error.code === ErrorCode.InvalidParams;
  if (!isJSONRPCResultResponse(message)) return false;
  const { isError, content } = message.result as { isError?: boolean; content?: Array<{ text?: unknown }> };
  const text = content?.[0]?.text;
  return isError === true && typeof text === 'string' && text.startsWith(`MCP error ${ErrorCode.InvalidParams}:`);
}

/**
 * Tells the action call at `position` among the request's action calls (single message or batch)
 * what became of it. By position, never by JSON-RPC id: two calls of a batch may share one.
 */
type TellCall = (position: number, result: CallResult) => void;

/**
 * Note each action call of the request once its result is known and the
 * response is gone (D7): the agent never waits for the database, and a failed
 * write only reaches the server's log.
 */
function noteActionCalls(
  calls: McpCalls,
  connectorId: string,
  version: number,
  arrival: { calledAt: Date; startedAt: number },
  body: unknown,
  responded: Promise<number>,
  /** Once SLICE is done with the request: how many of its action calls the engine was handed. */
  handled: Promise<number>
): TellCall {
  const noted = new Map<number, (result: CallResult) => void>();
  const actionCalls = (Array.isArray(body) ? body : [body]).flatMap((message) => actionCall(message) ?? []);
  const notes = actionCalls.map(
    (call, position) =>
      new Promise<CallNote>((resolve) => {
        noted.set(position, (result) => {
          noted.delete(position);
          const durationMs = Math.round(performance.now() - arrival.startedAt);
          resolve({ action: call.name, version, calledAt: arrival.calledAt, result, durationMs });
        });
      })
  );
  // A call still untold when the request ends on an error status never reached the engine:
  // the MCP protocol refused the request (4xx), or SLICE itself cut it short (5xx) (D4).
  void responded.then((status) => {
    if (status < 400) return;
    const result: CallResult = { kind: status >= 500 ? 'slice_error' : 'invalid_request' };
    for (const tell of [...noted.values()]) tell(result);
  });
  // A call SLICE never handed to its engine, on a request ending without an error status, met an
  // error of SLICE (D4). A call the engine has is left to it: the agent may leave before its result.
  void Promise.all([responded, handled]).then(([, delivered]) => {
    for (const [position, tell] of [...noted]) if (position >= delivered) tell({ kind: 'slice_error' });
  });
  if (notes.length > 0) {
    Promise.all([responded, ...notes])
      .then(([, ...written]) => calls.write(connectorId, written))
      .catch((err: unknown) => {
        // Whatever the reason (outage, constraint, bug), never an error for the agent: the log only.
        // eslint-disable-next-line no-console
        console.error('[hosted-mcp] noting calls failed:', err instanceof Error ? err.message : String(err));
      });
  }
  return (position, result) => noted.get(position)?.(result);
}

export function createHostedMcpRouter(options: HostedMcpRouterOptions): Router {
  const router = Router();
  const now = options.now ?? (() => new Date());

  router.all('/:id', async (req, res) => {
    const arrival = { calledAt: now(), startedAt: performance.now() };
    const responded = new Promise<number>((resolve) => res.once('close', () => resolve(res.statusCode)));
    let config: HostedMcpConfig | undefined;
    let savedKey: McpApiKey | undefined;
    try {
      config = await options.store.get(req.params.id);
      // Read once, at the arrival: the whole request is served with this key (D6).
      if (config) savedKey = await options.apiKeys?.keyOf(req.params.id);
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
    // The SDK hands over the request's messages one by one, in their order: the n-th action call is at position n.
    let delivered = 0;
    let settle: (delivered: number) => void = () => {};
    const handled = new Promise<number>((resolve) => (settle = resolve));
    const tellCall =
      options.calls && config.activeVersion !== undefined
        ? noteActionCalls(options.calls, req.params.id, config.activeVersion, arrival, req.body, responded, handled)
        : undefined;

    const served = new Set(config.endpoints.map((endpoint) => endpoint.name));
    const server = buildHostedMcpServer(config, {
      allowPrivateHosts: options.allowPrivateHosts,
      upstreamTimeoutMs: options.upstreamTimeoutMs,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      const authorization = req.headers.authorization ?? '';
      // An agent connected before a "Save" may still call an action the active version lacks (D7),
      // alone or in a batch: it is told to start over, and the API is never called.
      const deliver = transport.onmessage;
      transport.onmessage = (message, extra) => {
        const call = actionCall(message);
        if (!call) return deliver?.(message, extra);
        const position = delivered++;
        const onActionResult = (_requestId: string | number, result: CallResult) => tellCall?.(position, result);
        // The engine, and the SDK's answer, tell this call's result through the context it runs in.
        if (served.has(call.name)) return relayStore.run({ authorization, savedKey, onActionResult }, () => deliver?.(message, extra));
        onActionResult(call.id, { kind: 'not_available' });
        transport
          .send({ jsonrpc: '2.0', id: call.id, result: { content: [{ type: 'text', text: ACTION_GONE }], isError: true } })
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error('[hosted-mcp] answering a gone action failed:', err instanceof Error ? err.message : err);
          });
      };
      // A call whose values the SDK refuses never reaches the engine: only its response tells.
      const send = transport.send.bind(transport);
      transport.send = (message, sendOptions) => {
        if (refusesValues(message) && message.id !== undefined) {
          relayStore.getStore()?.onActionResult?.(message.id, { kind: 'invalid_request' });
        }
        return send(message, sendOptions);
      };
      await relayStore.run({ authorization, savedKey }, async () => {
        await transport.handleRequest(req, res, req.body);
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[hosted-mcp] request failed:', err instanceof Error ? err.stack : err);
      if (!res.headersSent) res.status(500).json({ error: 'Internal error.' });
    } finally {
      settle(delivered);
    }
  });

  return router;
}
