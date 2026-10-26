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
