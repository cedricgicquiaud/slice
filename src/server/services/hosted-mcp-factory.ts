/**
 * Core of SLICE's hosted runtime (Pivot-4) — the "shared engine".
 *
 * Given a stored config (a curated OpenAPI subset = the "fiche"), it builds an
 * `McpServer` in memory whose tools proxy to the upstream API, relaying the
 * caller's `Authorization` header, or else sending the key saved on SLICE for
 * this MCP, read at the request's arrival (P-WAT-43). One engine BECOMES
 * any MCP at request time, driven purely by the config. No code per client.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { z, type ZodTypeAny } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { PASTE_YOUR_TOKEN_HERE, type EndpointParam, type HttpMethod, type UpstreamAuth } from '@shared/types';
import { type ZodSchemaShape, schemaShapeForParam } from './zod-schema-builder';
import { SsrfError, assertPublicUrl } from './ssrf-guard';
import type { CallResult } from './mcp-calls';
import type { McpApiKey } from './mcp-api-key';

/** Knobs for the hosted engine. `allowPrivateHosts` is for tests/dev only. */
export interface HostedMcpOptions {
  /** When false (the production default), the upstream host is SSRF-guarded. */
  allowPrivateHosts?: boolean;
  /** How long an action waits for the API before it is abandoned (D5). Defaults to 30 seconds. */
  upstreamTimeoutMs?: number;
}

/** An action waits at most 30 seconds for the API (D5). */
const UPSTREAM_TIMEOUT_MS = 30_000;

/** One endpoint the hosted MCP exposes as a tool. */
export interface HostedEndpoint {
  name: string;
  /** The action's label on the selection screen, kept for the MCP's history; the engine ignores it. */
  label?: string;
  description: string;
  method: HttpMethod;
  path: string;
  params: EndpointParam[];
}

/**
 * One action of the API as the selection screen shows it, checked or not (D1):
 * kept at creation so the selection can change later without the API description.
 */
export interface ApiAction {
  name: string;
  label: string;
  /** The tag the action is grouped under. */
  group: string;
  description?: string;
  deprecated: boolean;
  method: HttpMethod;
  path: string;
  params: EndpointParam[];
}

/** The stored "fiche": everything the engine needs to serve one MCP. */
export interface HostedMcpConfig {
  name: string;
  /** The API's name as read in its description (D9), shown in the account's list of MCPs. */
  apiName?: string;
  baseUrl: string;
  upstreamAuth: UpstreamAuth;
  endpoints: HostedEndpoint[];
  /** Every action of the API, the selection's and the others (D1); the engine never serves them. */
  apiActions?: ApiAction[];
  /** ISO creation date: set by the store, which stamps the connector on `put` and returns it on `get`. */
  createdAt?: string;
  /** The workspace the connector belongs to (D15): given to the store's `put`, returned by `get`. */
  workspaceId?: string;
  /** The number of the version `endpoints` come from, the active one: returned by the store's `get`. */
  activeVersion?: number;
}

/** What one request tells the engine, and how the engine tells what became of its action calls. */
export interface RelayContext {
  authorization: string;
  /** The key saved on SLICE for this MCP, read once at the request's arrival (D6); none without one. */
  savedKey?: McpApiKey;
  /** Told the result of each action call the engine handled, by its JSON-RPC id (WAT-155). */
  onActionResult?: (requestId: string | number, result: CallResult) => void;
}

/**
 * Per-request relay context. The HTTP route wraps `handleRequest` in
 * `relayStore.run({ authorization, savedKey }, …)`; tool handlers read the
 * caller's token and the saved key from here, per request, keeping neither.
 */
export const relayStore = new AsyncLocalStorage<RelayContext>();

/**
 * The bearer token the caller relayed, or `undefined` for a missing/malformed
 * header. Restricted to printable ASCII to close off header injection (same
 * rule as the generated kit, Pivot-3).
 */
export function relayedToken(): string | undefined {
  const raw = relayStore.getStore()?.authorization ?? '';
  const match = /^Bearer\s+([\x21-\x7e]+)\s*$/i.exec(raw.trim());
  return match?.[1];
}

/** The key the agent sent of its own (D6): the example text of the snippets is none. */
function agentKey(): string | undefined {
  const token = relayedToken();
  return token === PASTE_YOUR_TOKEN_HERE ? undefined : token;
}

/** What the agent reads when the key saved on its MCP can no longer be read (D17). */
const SAVED_KEY_UNREADABLE = 'The API key saved on this MCP can no longer be read. Replace it on SLICE.';

/**
 * The value of the key saved on SLICE for the MCP the request is for, if it has one.
 * One SLICE can no longer read is never used: the call fails as SLICE's own error (D17).
 */
function savedKey(): string | undefined {
  const saved = relayStore.getStore()?.savedKey;
  if (saved && 'unreadable' in saved) throw new Error(SAVED_KEY_UNREADABLE);
  return saved?.key;
}

/**
 * Build a real Zod schema from a (narrow) OpenAPI shape, at runtime. Kept in
 * behavioural lockstep with the kit's string builder (`buildZodExpression`):
 * objects `.passthrough()` so undeclared keys (free-form request bodies like
 * Notion page `properties`) survive instead of being stripped. Exported for
 * the parity test.
 */
export function buildZodSchema(shape: ZodSchemaShape): ZodTypeAny {
  let base: ZodTypeAny;
  switch ((shape.type ?? '').toLowerCase()) {
    case 'integer':
      base = z.number().int();
      break;
    case 'number':
      base = z.number();
      break;
    case 'boolean':
      base = z.boolean();
      break;
    case 'array':
      base = z.array(shape.items ? buildZodSchema({ ...shape.items, required: true }) : z.unknown());
      break;
    case 'object': {
      const props = shape.properties ?? {};
      const requiredSet = new Set(shape.requiredFields ?? []);
      const entries: Record<string, ZodTypeAny> = {};
      for (const [name, child] of Object.entries(props)) {
        entries[name] = buildZodSchema({ ...child, required: requiredSet.has(name) });
      }
      base = z.object(entries).passthrough();
      break;
    }
    default: {
      const values = (shape.enum ?? []).filter((value) => typeof value === 'string');
      base = values.length > 0 ? z.enum(values as [string, ...string[]]) : z.string();
    }
  }
  const withOptional = shape.required === false ? base.optional() : base;
  return shape.description ? withOptional.describe(shape.description) : withOptional;
}

/**
 * Reassemble the outgoing JSON body from the `in:'body'` params (R-B9/R-B10).
 * Flattened fields → `{ [wireName]: value }` (always sent, even `{}`). A single
 * whole-body fallback param (no `wireName`) → its value is the body, sent only
 * when provided. Undici refuses a body on GET/HEAD, so we skip it there.
 */
function assembleBody(
  endpoint: HostedEndpoint,
  args: Record<string, unknown>
): string | undefined {
  if (endpoint.method === 'GET') return undefined;
  const bodyParams = endpoint.params.filter((p) => p.in === 'body');
  if (bodyParams.length === 0) return undefined;

  const fallback =
    bodyParams.length === 1 && bodyParams[0]!.wireName === undefined ? bodyParams[0]! : undefined;
  if (fallback) {
    const value = args[fallback.name];
    return value === undefined ? undefined : JSON.stringify(value);
  }

  const obj: Record<string, unknown> = {};
  for (const p of bodyParams) {
    const value = args[p.name];
    if (value !== undefined) obj[p.wireName ?? p.name] = value;
  }
  return JSON.stringify(obj);
}

/** The API answered with a code other than 2xx, kept apart from the message the agent reads. */
export class UpstreamFailure extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'UpstreamFailure';
  }
}

/** The API did not answer; the agent reads the same message as the error it stands for. */
export class UpstreamUnreachable extends Error {
  constructor(cause: Error) {
    super(cause.message, { cause });
    this.name = 'UpstreamUnreachable';
  }
}

/** Undici's own error when no response came: refused connection, unknown host, reset socket. */
function isNetworkFailure(err: unknown): err is TypeError {
  return err instanceof TypeError && err.message === 'fetch failed';
}

/** What became of a call that threw: anything but the API's answer or silence is SLICE's own error (D4). */
function resultOfFailedCall(err: unknown): CallResult {
  if (err instanceof UpstreamFailure) return { kind: 'failed', status: err.status };
  if (err instanceof UpstreamUnreachable) return { kind: 'api_unreachable' };
  return { kind: 'slice_error' };
}

/** Issue the upstream call for one tool invocation, with the caller's token or else the saved key (D6). */
async function callUpstream(
  config: HostedMcpConfig,
  endpoint: HostedEndpoint,
  args: Record<string, unknown>,
  allowPrivateHosts: boolean,
  timeoutMs: number
): Promise<unknown> {
  const ownKey = agentKey();
  const token = ownKey ?? savedKey();
  // The saved key never reaches the agent: an API copying it into its error has it hidden (D12).
  const hidden = ownKey === undefined ? token : undefined;
  // Defense in depth: re-check the host at request time, not just at config
  // creation. The caller controls neither host nor protocol here (both are
  // fixed in the stored config), but DNS for a hostname could have changed.
  if (!allowPrivateHosts) {
    try {
      await assertPublicUrl(config.baseUrl);
    } catch (err) {
      // A refused address is an API SLICE cannot reach, never a fault of SLICE (D4).
      throw err instanceof SsrfError ? new UpstreamUnreachable(err) : err;
    }
  }
  let path = endpoint.path;
  for (const p of endpoint.params.filter((x) => x.in === 'path')) {
    path = path.replace(`{${p.name}}`, encodeURIComponent(String(args[p.name])));
  }
  const search = new URLSearchParams();
  for (const p of endpoint.params.filter((x) => x.in === 'query')) {
    const value = args[p.name];
    if (value !== undefined && value !== null) search.append(p.name, String(value));
  }
  const qs = search.toString();
  const url = `${config.baseUrl}${path}${qs ? `?${qs}` : ''}`;

  // Header names ignore case: setting one replaces it whatever case it was written in.
  const headers = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
  });
  // Forward `in: header` params the agent supplied (e.g. Notion-Version, which
  // the upstream requires on every call). Applied before the auth relay so a
  // header param can never clobber the relayed token.
  for (const p of endpoint.params.filter((x) => x.in === 'header')) {
    const value = args[p.name];
    if (value !== undefined && value !== null) headers.set(p.name, String(value));
  }
  if (token) {
    // oauth2 is relayed exactly like bearer here: the hosted runtime never runs
    // the client_credentials flow (no secret on SLICE Cloud) — the agent's own
    // access token is forwarded. The auto flow lives only in the self-host kit.
    if (config.upstreamAuth.type === 'bearer' || config.upstreamAuth.type === 'oauth2') {
      headers.set('Authorization', `Bearer ${token}`);
    } else if (config.upstreamAuth.type === 'apiKey' && config.upstreamAuth.headerName) {
      headers.set(config.upstreamAuth.headerName, token);
    }
  }

  const body = assembleBody(endpoint, args);

  // The API that has not answered in time is an API SLICE cannot reach (D4, D5).
  const silence = new Error(`The API did not answer within ${timeoutMs / 1000} seconds.`);
  const abandon = new AbortController();
  const timer = setTimeout(() => abandon.abort(silence), timeoutMs);
  try {
    const res = await fetch(url, { method: endpoint.method, headers, body, signal: abandon.signal });
    if (!res.ok) {
      const message = `Upstream ${res.status} ${res.statusText}: ${await res.text()}`;
      throw new UpstreamFailure(res.status, hidden ? message.replaceAll(hidden, '[hidden]') : message);
    }
    const ct = res.headers.get('content-type') ?? '';
    return await (ct.includes('application/json') ? res.json() : res.text());
  } catch (err) {
    if (isNetworkFailure(err)) throw new UpstreamUnreachable(err);
    throw err === silence ? new UpstreamUnreachable(silence) : err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * MCP hints the agent uses to tell reads from writes. Same rule as screen 2's
 * Reads/Writes filter: only GET reads. Every other method — unknown ones
 * included — is a possibly destructive write (a POST can delete). All four
 * hints are explicit: absent, the protocol defaults would apply instead.
 */
export function toolAnnotationsFor(method: string): ToolAnnotations {
  const reads = method.toUpperCase() === 'GET';
  return {
    readOnlyHint: reads,
    destructiveHint: !reads,
    idempotentHint: reads,
    openWorldHint: true,
  };
}

/**
 * Build an in-memory MCP server from a config. Cheap object construction —
 * call it per session (and cache by id). The config drives everything; the
 * code below is identical for every MCP.
 */
export function buildHostedMcpServer(
  config: HostedMcpConfig,
  options: HostedMcpOptions = {}
): McpServer {
  const allowPrivateHosts = options.allowPrivateHosts ?? false;
  const upstreamTimeoutMs = options.upstreamTimeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const server = new McpServer({ name: config.name, version: '0.1.0' });
  for (const endpoint of config.endpoints) {
    const shape: Record<string, ZodTypeAny> = {};
    for (const p of endpoint.params) {
      shape[p.name] = buildZodSchema(schemaShapeForParam(p));
    }
    server.tool(
      endpoint.name,
      endpoint.description,
      shape,
      toolAnnotationsFor(endpoint.method),
      async (args: Record<string, unknown>, extra) => {
        const tell = (result: CallResult) => relayStore.getStore()?.onActionResult?.(extra.requestId, result);
        try {
          const result = await callUpstream(config, endpoint, args, allowPrivateHosts, upstreamTimeoutMs);
          tell({ kind: 'succeeded' });
          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          tell(resultOfFailedCall(err));
          throw err;
        }
      }
    );
  }
  return server;
}
