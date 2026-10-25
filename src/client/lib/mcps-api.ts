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
  const { mcps } = (await res.json()) as { mcps: Mcp[] };
  return mcps;
}
