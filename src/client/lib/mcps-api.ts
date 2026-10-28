import type { EndpointGroup, McpSelectionChange } from '@shared/types';
import { ApiError, type ApiErrorBody } from './api';
import { refreshSession } from './auth-client';

/** One MCP of the signed-in account, as `GET /api/mcps` lists it. */
export interface Mcp {
  id: string;
  /** The API's name as read in its description, else its domain. */
  apiName: string;
  actionCount: number;
  /** ISO creation date. */
  createdAt: string;
  /** The MCP's address, to paste into the agent. */
  url: string;
}

/** One version of an MCP: a numbered, dated selection (D4). */
export interface McpVersion {
  number: number;
  /** ISO creation date. */
  createdAt: string;
  /** ISO date the version last became the active one (D8), `null` while it is not. */
  activeSince: string | null;
  /** The labels of its actions, in their order. */
  actionLabels: string[];
}

/** An MCP's history, as `GET /api/mcps/:id/versions` reads it. */
export interface McpHistory {
  /** The API's name as read in its description, else its domain. */
  apiName: string;
  /** Newest first. */
  versions: McpVersion[];
}

/** The calls of one action over the last 30 days (D10). */
export interface ActionUsage {
  name: string;
  label: string;
  /** Whether the action is one of the active version's. */
  available: boolean;
  calls: number;
  succeeded: number;
  /** The average duration of the succeeded calls, in milliseconds; `null` without any. */
  averageDurationMs: number | null;
  /** ISO date of the last call, `null` without any. */
  lastCalledAt: string | null;
}

/** What became of an action call (D4); a failure keeps the API's status code. */
export type CallResult =
  | { kind: 'succeeded' }
  | { kind: 'failed'; status: number }
  | { kind: 'api_unreachable' }
  | { kind: 'invalid_request' }
  | { kind: 'not_available' }
  | { kind: 'slice_error' };

/** One of the recent calls (D10). */
export interface RecentCall {
  /** ISO date the call arrived at SLICE. */
  calledAt: string;
  action: string;
  /** The action's label, else its name. */
  label: string;
  result: CallResult;
  durationMs: number;
  /** The number of the version active when the call arrived. */
  version: number;
}

/** An MCP's usage over the last 30 days, as `GET /api/mcps/:id/usage` reads it (D10). */
export interface McpUsage {
  /** The API's name as read in its description, else its domain. */
  apiName: string;
  /** The active version's actions, in their order, then the API's other actions called in the period. */
  actions: ActionUsage[];
  /** The days of the period (`YYYY-MM-DD`, UTC) on which 10,000 calls were noted (D8). */
  cappedDays: string[];
  /** The 50 most recent calls, newest first. */
  recentCalls: RecentCall[];
}

/** What "Edit actions" shows, as `GET /api/mcps/:id/selection` reads it (D2). */
export interface McpSelection {
  /** The API's name as read in its description, else its domain. */
  apiName: string;
  /** The active version's number: a "Save" starts from it (D13). */
  version: number;
  /** Every action of the API, by group. */
  groups: EndpointGroup[];
  /** The ids of the active version's actions. */
  selectedIds: string[];
}

/** An MCP's saved API key, as `GET /api/mcps/:id/api-key` tells it: never the key itself (D3). */
export interface McpApiKey {
  /** ISO date of the last "Save" or "Replace". */
  savedAt: string;
  /** `false` when SLICE can no longer read the key: it must be replaced (D3). */
  readable: boolean;
}

/** The MCPs of the signed-in account, newest first. */
export async function listMcps(): Promise<Mcp[]> {
  const res = await fetch('/api/mcps');
  if (!res.ok) await throwRefusal(res);
  const { mcps } = (await res.json()) as { mcps: Mcp[] };
  return mcps;
}

/** The versions of one of the account's MCPs (D8). */
export async function getMcpHistory(id: string): Promise<McpHistory> {
  const res = await fetch(`/api/mcps/${id}/versions`);
  if (!res.ok) await throwRefusal(res);
  return (await res.json()) as McpHistory;
}

/** The usage of one of the account's MCPs over the last 30 days (D10). */
export async function getMcpUsage(id: string): Promise<McpUsage> {
  const res = await fetch(`/api/mcps/${id}/usage`);
  if (!res.ok) await throwRefusal(res);
  return (await res.json()) as McpUsage;
}

/** The selection of one of the account's MCPs, for "Edit actions" (D2). */
export async function getMcpSelection(id: string): Promise<McpSelection> {
  const res = await fetch(`/api/mcps/${id}/selection`);
  if (!res.ok) await throwRefusal(res);
  return (await res.json()) as McpSelection;
}

/** Save a new selection of one of the account's MCPs as its next version (D4); returns its number. */
export async function saveMcpSelection(id: string, change: McpSelectionChange): Promise<number> {
  const res = await fetch(`/api/mcps/${id}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(change),
  });
  if (!res.ok) await throwRefusal(res);
  const { number } = (await res.json()) as { number: number };
  return number;
}

/** Make a version of one of the account's MCPs the active one again (D9); returns the ISO date it is active since. */
export async function restoreMcpVersion(id: string, number: number): Promise<string> {
  const res = await fetch(`/api/mcps/${id}/versions/${number}/restore`, { method: 'POST' });
  if (!res.ok) await throwRefusal(res);
  const { activeSince } = (await res.json()) as { activeSince: string };
  return activeSince;
}

/** The saved API key of one of the account's MCPs, `null` without any (D3). */
export async function getMcpApiKey(id: string): Promise<McpApiKey | null> {
  const res = await fetch(`/api/mcps/${id}/api-key`);
  if (!res.ok) await throwRefusal(res);
  const { apiKey } = (await res.json()) as { apiKey: McpApiKey | null };
  return apiKey;
}

/** Delete one of the account's MCPs, at once (D10). */
export async function deleteMcp(id: string): Promise<void> {
  const res = await fetch(`/api/mcps/${id}`, { method: 'DELETE' });
  if (!res.ok) await throwRefusal(res);
}

/**
 * The server's `{ code, message }` as an `ApiError`. A 401 also sends the app
 * back to the sign-in screen, as the calls of `api.ts` do.
 */
async function throwRefusal(res: Response): Promise<never> {
  if (res.status === 401) refreshSession();
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  throw new ApiError(
    res.status,
    body?.code ?? 'UNKNOWN',
    body?.message || 'Could not reach the server. Try again in a moment.'
  );
}
