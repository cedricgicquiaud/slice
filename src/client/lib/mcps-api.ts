import { ApiError, type ApiErrorBody } from './api';

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

/** The MCPs of the signed-in account, newest first. */
export async function listMcps(): Promise<Mcp[]> {
  const res = await fetch('/api/mcps');
  if (!res.ok) await throwRefusal(res);
  const { mcps } = (await res.json()) as { mcps: Mcp[] };
  return mcps;
}

/** The server's `{ code, message }` as an `ApiError`. */
async function throwRefusal(res: Response): Promise<never> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  throw new ApiError(
    res.status,
    body?.code ?? 'UNKNOWN',
    body?.message || 'Could not reach the server. Try again in a moment.'
  );
}
