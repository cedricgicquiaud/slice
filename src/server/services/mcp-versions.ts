/**
 * The versions of an MCP, as its "History" page shows them (D8).
 */
import { and, asc, desc, eq } from 'drizzle-orm';
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
  /** Newest first. */
  versions: McpVersion[];
}

/** The name an MCP goes by: its API's name as read in its description, else its API's domain (D9). */
export function apiNameOf(connector: { apiName: string | null; baseUrl: string }): string {
  return connector.apiName ?? new URL(connector.baseUrl).hostname;
}

/**
 * The history of the MCP `id` of `workspaceId`, or `undefined` when `workspaceId`
 * has no such MCP, whoever else owns it (D12).
 */
export async function readMcpHistory(
  database: Database,
  workspaceId: string,
  id: string
): Promise<McpHistory | undefined> {
  // One statement, so one moment: a "Save" or a deletion running alongside is seen whole or not at all.
  const rows = await database.db
    .select({
      apiName: connectors.apiName,
      baseUrl: connectors.baseUrl,
      number: connectorVersions.number,
      createdAt: connectorVersions.createdAt,
      activeSince: connectorVersions.activeSince,
      label: connectorActions.label,
    })
    .from(connectors)
    .innerJoin(connectorVersions, eq(connectorVersions.connectorId, connectors.id))
    .leftJoin(
      connectorActions,
      and(eq(connectorActions.connectorId, connectorVersions.connectorId), eq(connectorActions.version, connectorVersions.number))
    )
    .where(and(eq(connectors.id, id), eq(connectors.workspaceId, workspaceId)))
    .orderBy(desc(connectorVersions.number), asc(connectorActions.position));
  const [first] = rows;
  if (!first) return undefined;
  const versions: McpVersion[] = [];
  for (const row of rows) {
    let version = versions.at(-1);
    if (version?.number !== row.number) {
      version = {
        number: row.number,
        createdAt: row.createdAt.toISOString(),
        activeSince: row.activeSince?.toISOString() ?? null,
        actionLabels: [],
      };
      versions.push(version);
    }
    if (row.label !== null) version.actionLabels.push(row.label);
  }
  return { apiName: apiNameOf(first), versions };
}
