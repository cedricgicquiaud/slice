/**
 * The versions of an MCP, as its "History" page shows them (D8).
 */
import { asc, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { connectorActions, connectorVersions, connectors } from '../db/schema';

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

export interface McpHistory {
  /** The API's name as read in its description, else its domain. */
  apiName: string;
  versions: McpVersion[];
}

/** The history of the MCP `id`, or `undefined` when there is no such MCP. */
export async function readMcpHistory(database: Database, id: string): Promise<McpHistory | undefined> {
  const { db } = database;
  const [connector] = await db
    .select({ apiName: connectors.apiName, baseUrl: connectors.baseUrl })
    .from(connectors)
    .where(eq(connectors.id, id));
  if (!connector) return undefined;
  const versions = await db.select().from(connectorVersions).where(eq(connectorVersions.connectorId, id));
  const actions = await db
    .select({ version: connectorActions.version, label: connectorActions.label })
    .from(connectorActions)
    .where(eq(connectorActions.connectorId, id))
    .orderBy(asc(connectorActions.position));
  return {
    apiName: connector.apiName ?? new URL(connector.baseUrl).hostname,
    versions: versions.map((version) => ({
      number: version.number,
      createdAt: version.createdAt.toISOString(),
      activeSince: version.activeSince?.toISOString() ?? null,
      actionLabels: actions.filter((action) => action.version === version.number).map((action) => action.label),
    })),
  };
}
